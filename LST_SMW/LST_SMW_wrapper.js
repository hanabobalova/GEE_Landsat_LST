/*
This code is heavily based on the work of Sofia Ermida (sofia.ermida@ipma.pt; @ermida_sofia)
This code is free and open.
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
Ermida, S.L., Soares, P., Mantas, V., Göttsche, F.-M., Trigo, I.F., 2020. 
    Google Earth Engine open-source code for Land Surface Temperature estimation from the Landsat series.
    Remote Sensing, 12 (9), 1471; https://doi.org/10.3390/rs12091471

    
Author: Hana Bobáľová (hana.bobalova@uniba.sk), Šimon Opravil (simon.opravil@savba.sk)

This file acts as a wrapper for the Landsat Surface Temperature (LST) calculation 
using the Single-Channel Method (SMW). It integrates the NDVI-based emissivity calculation 
from `LSE_NBEM.js` and the LST algorithm from `SMWalgorithm.js`.

USES:
    - LSE_NBEM.js
    - SMWalgorithm.js
    - NCEP_TPW.js (for atmospheric water vapor correction)
    - helpers.js (for utility functions)

INPUTS:
    - coll: <string>
        Landsat satellite ID. Valid inputs: 'L4', 'L5', 'L7', 'L8', 'L9'.
    - aoi: <ee.Geometry>
        Region of interest (ROI) as a geometry object.
    - start: <string> or <list>
        Start date(s) for filtering the image collection. Can be a single date string 
        or a list of date strings.
    - end: <string> (optional)
        End date for filtering the image collection. If specified, `start` must be a 
        single date string.
    - lseMethod: <number>
        Determines how emissivity is calculated:
        0: Emissivity is obtained directly from ASTER.
        1: NDVI values are used to obtain dynamic emissivity from ASTER.
        2: Emissivity is calculated using the NDVI-based method (NBEM).
    - nbem: <string>
        Equations used to calculate NDVI-based emissivity. 
        Valid inputs: 'Skoković', 'Sobrino', 'Yu', 'SNDVI'. For References, please see the LSE_NBEM.js file.
    - emissVals: <string>
        Emissivity values of soil and vegetation used in the SNDVI method. 
        Valid inputs: 'Skoković', 'Wang', 'Yu'. For References, please see the LSE_NBEM.js file.

OUTPUTS:
    - <ee.ImageCollection>
        An image collection with the following bands:
        - Original Landsat bands: SR_B2, SR_B3, SR_B4, SR_B5, etc.
        - NDVI: Normalized Difference Vegetation Index
        - FVC: Fractional Vegetation Cover
        - TPW: Total Precipitable Water
        - TPWpos: Positive TPW values
        - EM: Surface emissivity of the TIR band
        - LST: Land Surface Temperature (Kelvin)
*/

var help_func = require('users/hanabobalova/LST_Landsat:SMW/helpers');
var em_func = require('users/hanabobalova/LST_Landsat:SMW/LSE_NBEM');
var NCEP_TPW = require('users/sofiaermida/landsat_smw_lst:modules/NCEP_TPW.js');
var LST = require('users/sofiaermida/landsat_smw_lst:modules/SMWalgorithm.js');

// Check if a parameter is empty
function isEmptyParameter(parameter) {
  return parameter === undefined || parameter === null;
}

// Check if a parameter is a list
function isList(parameter) {
  return Array.isArray(parameter);
}

// Check if a parameter is a string
function isString(parameter) {
  return typeof parameter === 'string';
}

// Get Landsat-specific parameters
var getLandsatParams = function(coll) {
    var coefficients = {
        'L4': { coll_SR: 'LANDSAT/LT04/C02/T1_L2', TOA: 'LANDSAT/LT04/C02/T1_TOA', SR_bands: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'QA_PIXEL'], TIR_band: ['B6'] },
        'L5': { coll_SR: 'LANDSAT/LT05/C02/T1_L2', TOA: 'LANDSAT/LT05/C02/T1_TOA', SR_bands: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'QA_PIXEL'], TIR_band: ['B6'] },
        'L7': { coll_SR: 'LANDSAT/LE07/C02/T1_L2', TOA: 'LANDSAT/LE07/C02/T1_TOA', SR_bands: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'QA_PIXEL'], TIR_band: ['B6_VCID_1', 'B6_VCID_2'] },
        'L8': { coll_SR: 'LANDSAT/LC08/C02/T1_L2', TOA: 'LANDSAT/LC08/C02/T1_TOA', SR_bands: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'ST_B10', 'ST_ATRAN', 'ST_URAD', 'ST_DRAD', 'QA_PIXEL'], TIR_band: ['B10', 'B11'] },
        'L9': { coll_SR: 'LANDSAT/LC09/C02/T1_L2', TOA: 'LANDSAT/LC09/C02/T1_TOA', SR_bands: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'ST_B10', 'ST_ATRAN', 'ST_URAD', 'ST_DRAD', 'QA_PIXEL'], TIR_band: ['B10', 'B11'] }
    };
    return coefficients[coll] || coefficients.default;
};

// Cloud masking for TOA images
var cm_toa = function(image) {
    var qa = image.select('QA_PIXEL');
    var mask = qa.bitwiseAnd(1 << 3);
    return image.updateMask(mask.not());
};

// Cloud masking for SR images
var cm_sr = function(image) {
    var qa = image.select('QA_PIXEL');
    var mask = qa.bitwiseAnd(1 << 3)
      .or(qa.bitwiseAnd(1 << 4));
    return image.updateMask(mask.not());
};

// Get SR and TOA collections based on start and end dates
var getSRCollection_start_end = function(coll, aoi, start, end) {
    var startDate = ee.Date(start);
    var endDate = ee.Date(end);
    var collParams = getLandsatParams(coll);

    var ic_sr = ee.ImageCollection(collParams.coll_SR)
        .filterBounds(aoi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'))
        .select(collParams.SR_bands);

    var ic_toa = ee.ImageCollection(collParams.TOA)
        .filterBounds(aoi)
        .filterDate(startDate, endDate)
        .map(cm_toa);

    return [ic_sr, ic_toa];
};

// Get SR and TOA collections based on a single start date
var getSRCollection_start_string = function(coll, aoi, start) {
    var startDate = ee.Date(start);
    var endDate = ee.Date(start).advance(1, 'day');
    var collParams = getLandsatParams(coll);

    var ic_sr = ee.ImageCollection(collParams.coll_SR)
        .filterBounds(aoi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'))
        .select(collParams.SR_bands);

    var ic_toa = ee.ImageCollection(collParams.TOA)
        .filterBounds(aoi)
        .filterDate(startDate, endDate)
        .map(cm_toa);

    return [ic_sr, ic_toa];
};

// Get SR and TOA collections based on a list of start dates
var getSRCollection_start_list = function(coll, aoi, start) {
    var filterSR = function(date) {
        var startDate = ee.Date(date);
        var endDate = ee.Date(date).advance(1, 'day');
        var collParams = getLandsatParams(coll);
        return ee.ImageCollection(collParams.coll_SR)
            .filterDate(startDate, endDate)
            .filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'))
            .filterBounds(aoi)
            .select(collParams.SR_bands)
            .first();
    };

    var filterTOA = function(date) {
        var startDate = ee.Date(date);
        var endDate = ee.Date(date).advance(1, 'day');
        var collParams = getLandsatParams(coll);
        return ee.ImageCollection(collParams.TOA)
            .filterDate(startDate, endDate)
            .filterBounds(aoi)
            .map(cm_toa)
            .first();
    };

    var ic_sr = ee.ImageCollection(start.map(filterSR));
    var ic_toa = ee.ImageCollection(start.map(filterTOA));

    return [ic_sr, ic_toa];
};

// Main function to process the Landsat collection
exports.collection = function(prms) {
    var landsatSR, landsatTOA;

    if (isEmptyParameter(prms.end) && isList(prms.start)) {
        landsatSR = getSRCollection_start_list(prms.coll, prms.aoi, prms.start)[0];
        landsatTOA = getSRCollection_start_list(prms.coll, prms.aoi, prms.start)[1];
    } else if (isEmptyParameter(prms.end) && isString(prms.start)) {
        landsatSR = getSRCollection_start_string(prms.coll, prms.aoi, prms.start)[0];
        landsatTOA = getSRCollection_start_string(prms.coll, prms.aoi, prms.start)[1];
    } else if (isString(prms.start) && !isEmptyParameter(prms.end)) {
        landsatSR = getSRCollection_start_end(prms.coll, prms.aoi, prms.start, prms.end)[0];
        landsatTOA = getSRCollection_start_end(prms.coll, prms.aoi, prms.start, prms.end)[1];
    }

    var collection_dict = getLandsatParams(prms.coll);

    landsatSR = landsatSR
                .map(help_func.calcNDVI)
                .map(help_func.calcFVC)
                .map(NCEP_TPW.addBand)
                .map(em_func.addBand(prms.coll, prms.lseMethod, prms.nbem, prms.emissVals));

    var tir = ee.List(collection_dict.TIR_band);
    var visw = ee.List(collection_dict.SR_bands)
                .add('NDVI')
                .add('FVC')
                .add('TPW')
                .add('TPWpos')
                .add('EM');

    var landsatALL = landsatSR.select(visw).combine(landsatTOA.select(tir), true);

    // Compute the LST
    var landsatLST = landsatALL.map(LST.addBand(prms.coll));

    return landsatLST;
};

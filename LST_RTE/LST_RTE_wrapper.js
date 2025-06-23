/*
Author: Hana Bobalova (hana.bobalova@uniba.sk), Simon Opravil (simon.opravil@savba.sk)

This code is free and open. 

This file acts as a wrapper for the core functions in `RTE_functions.js`. It provides 
a simplified interface for calculating Land Surface Temperature (LST) using the 
Radiative Transfer Equation (RTE) method. The wrapper handles Landsat image collection 
filtering, cloud masking, and parameter passing to the core functions.

USES:
    - LST_RTE_functions.js
*/

var rte_func = require('users/hanabobalova/LST_Landsat:LST_RTE/LST_RTE_functions');

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

// Get Landsat parameters based on the satellite ID
var getLandsatParams = function(coll) {
  switch(coll) {
    case 'L9':
      return {
        coll_SR: 'LANDSAT/LC09/C02/T1_L2',
        coll_DN: 'LANDSAT/LC09/C02/T1',
        SR_bands: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'ST_B10', 'ST_ATRAN', 'ST_URAD', 'ST_DRAD', 'QA_PIXEL'],
        TIR_band: ['B10'],
        K1_string: 'K1_CONSTANT_BAND_10',
        K2_string: 'K2_CONSTANT_BAND_10'
      };
    case 'L8':
      return {
        coll_SR: 'LANDSAT/LC08/C02/T1_L2',
        coll_DN: 'LANDSAT/LC08/C02/T1',
        SR_bands: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'ST_B10', 'ST_ATRAN', 'ST_URAD', 'ST_DRAD', 'QA_PIXEL'],
        TIR_band: ['B10'],
        K1_string: 'K1_CONSTANT_BAND_10',
        K2_string: 'K2_CONSTANT_BAND_10'
      };
    case 'L7':
      return {
        coll_SR: 'LANDSAT/LE07/C02/T1_L2',
        coll_DN: 'LANDSAT/LE07/C02/T1',
        SR_bands: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'ST_B6', 'ST_ATRAN', 'ST_URAD', 'ST_DRAD', 'QA_PIXEL'],
        TIR_band: ['B6_VCID_1'],
        K1_string: 'K1_CONSTANT_BAND_6_VCID_1',
        K2_string: 'K2_CONSTANT_BAND_6_VCID_2'
      };
    case 'L5':
      return {
        coll_SR: 'LANDSAT/LT05/C02/T1_L2',
        coll_DN: 'LANDSAT/LT05/C02/T1',
        SR_bands: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'ST_B6', 'ST_ATRAN', 'ST_URAD', 'ST_DRAD', 'QA_PIXEL'],
        TIR_band: ['B6'],
        K1_string: 'K1_CONSTANT_BAND_6',
        K2_string: 'K2_CONSTANT_BAND_6'
      };
    case 'L4':
      return {
        coll_SR: 'LANDSAT/LT04/C02/T1_L2',
        coll_DN: 'LANDSAT/LT04/C02/T1',
        SR_bands: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'ST_B6', 'ST_ATRAN', 'ST_URAD', 'ST_DRAD', 'QA_PIXEL'],
        TIR_band: ['B6'],
        K1_string: 'K1_CONSTANT_BAND_6',
        K2_string: 'K2_CONSTANT_BAND_6'
      };
    default:
      throw new Error('Invalid Landsat abbreviation');
  }
};

// Get Surface Reflectance (SR) collection based on start and end dates
var getSRCollection_start_end = function(coll, aoi, start, end) {
  var startDate = ee.Date(start);
  var endDate = ee.Date(end);
  var collParams = getLandsatParams(coll);
  var ic = ee.ImageCollection(collParams.coll_SR)
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'))
    .select(collParams.SR_bands);
  return ic;
};

// Get SR collection based on a single start date
var getSRCollection_start_string = function(coll, aoi, start) {
  var startDate = ee.Date(start);
  var endDate = ee.Date(start).advance(1, 'day');
  var collParams = getLandsatParams(coll);
  var ic = ee.ImageCollection(collParams.coll_SR)
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'))
    .select(collParams.SR_bands);
  return ic;
};

// Get SR collection based on a list of start dates
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
  return ee.ImageCollection(start.map(filterSR));
};

// Mask clouds in an image using the QA_PIXEL band
var maskClouds = function(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3)
    .or(qa.bitwiseAnd(1 << 4));
  return image.updateMask(mask.not());
};

// Main function to calculate LST using RTE
exports.LST_RTE = function(prms) {
  var landsatSR = ee.ImageCollection('RTE');
  if (isEmptyParameter(prms.end) && isList(prms.start)) {
    landsatSR = getSRCollection_start_list(prms.coll, prms.aoi, prms.start);
  } else if (isEmptyParameter(prms.end) && isString(prms.start)) {
    landsatSR = getSRCollection_start_string(prms.coll, prms.aoi, prms.start);
  } else if (isString(prms.start) && !isEmptyParameter(prms.end)) {
    landsatSR = getSRCollection_start_end(prms.coll, prms.aoi, prms.start, prms.end);
  }

  landsatSR = landsatSR
      .map(rte_func.calcNDVI)
      .map(rte_func.calcFVC)
      .map(rte_func.calcLSE(prms.nbem, prms.emissVals));

  function filterDNBySceneIDs(coll) {
    return function(image) {
      var sceneID = image.get('system:index');
      var collection = getLandsatParams(coll);
      return ee.ImageCollection(collection.coll_DN)
        .filterMetadata('system:index', 'equals', sceneID)
        .select(collection.TIR_band)
        .first();
    };
  }

  var filteredDN = landsatSR.map(filterDNBySceneIDs(prms.coll));
  var landsatTOA = filteredDN.map(rte_func.calcLTOA);
  var K1 = landsatTOA.first().get(getLandsatParams(prms.coll).K1_string);
  var K2 = landsatTOA.first().get(getLandsatParams(prms.coll).K2_string);

  var landsatLST = landsatSR.combine(landsatTOA)
    .map(rte_func.calcBTS)
    .map(rte_func.calcLST(K1, K2))
    .map(rte_func.calcLSTC)
    .map(rte_func.calcST);

  print('Set the ImageToDisplay parameter using the index of the image corresponding to its date.', landsatLST.aggregate_array('DATE_ACQUIRED'));
  return landsatLST.map(maskClouds);
};

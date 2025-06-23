/*
Author: Hana Bobalova (hana.bobalova@uniba.sk), Simon Opravil (simon.opravil@savba.sk)

This code is free and open.

This file contains the core functions for calculating Land Surface Temperature (LST) 
using the Radiative Transfer Equation (RTE) method combined with the NDVI-based 
emissivity method (NBEM). These functions compute the following parameters:

- NDVI: Normalized Difference Vegetation Index
- FVC: Fractional Vegetation Cover
- LSE: Land Surface Emissivity
- LTOA: Top of Atmosphere Radiance
- BTS: Blackbody (ground) Radiance
- LST: Land Surface Temperature (in Kelvin)
- LSTC: Land Surface Temperature (in Celsius)
- ST: Surface Temperature from USGS Landsat ST product (in Kelvin)

The functions are designed to be used in a processing chain, as demonstrated in the 
wrapper and example files.

References:
- Skoković, D., Sobrino, J.A., Jiménez‐Muñoz, J.C., Sòria, G., Julien, Y., C, M., Cristóbal, J., 2014. 
    Calibration and validation of land surface temperature for Landsat8-TIRS sensor, in: ESA Land Product
    Validation and Evolution. Frascati (Italy). https://doi.org/10.1063/1.452862
- Sobrino, J.A., Jiménez-Muñoz, J.C., Sòria, G., Romaguera, M., Guanter, L., Moreno, J., Plaza, A., 
    Martínez, P., 2008. Land surface emissivity retrieval from different VNIR and TIR sensors. 
    IEEE Trans. Geosci. Remote Sens. 46, 316–327. https://doi.org/10.1109/TGRS.2007.904834
- Wang, K., Liang, S., 2009. Evaluation of ASTER and MODIS land surface temperature and emissivity 
    products using long-term surface longwave radiation observations at SURFRAD sites. 
    Remote Sens. Environ. 113, 1556–1565. https://doi.org/10.1016/j.rse.2009.03.009
- Yu, X., Guo, X., Wu, Z., 2014. Land surface temperature retrieval from landsat 8 TIRS-comparison 
    between radiative transfer equation-based method, split window algorithm and single channel method. 
    Remote Sens. 6, 9829–9852. https://doi.org/10.3390/rs6109829
*/

// NDVI thresholds for emissivity calculation
var s_th = 0.2; // NDVIs (bare soil) threshold
var v_th = 0.5; // NDVIv (vegetation) threshold

// Get emissivity values based on the selected method
function getEmissivityValues(method) {
  var methods = {
    'Wang': { e_s: 0.966, e_v: 0.973, e_w: 0.991 },
    'Yu': { e_s: 0.9668, e_v: 0.9863, e_w: 0.991 },
    'Skokovic': { e_s: 0.971, e_v: 0.987, e_w: 0.991 }
  };
  return methods[method] || methods['Skokovic'];
}

// Calculate NDVI with scaled reflectance values
exports.calcNDVI = function(image) {
    var nir = 3;
    var red = 2;
    var ndvi = image.expression('(nir-red)/(nir+red)', {
        'nir': image.select(nir).multiply(0.0000275).add(-0.2), 
        'red': image.select(red).multiply(0.0000275).add(-0.2)
      }).rename('NDVI');
    return image.addBands(ndvi);
};

// Calculate Fractional Vegetation Cover (FVC) from NDVI
exports.calcFVC = function(image) {
    var ndvi = image.select('NDVI');
    var fvc1 = image.expression('((ndvi-ndvi_s)/(ndvi_v - ndvi_s))**2', {
        'ndvi': ndvi, 'ndvi_s': s_th, 'ndvi_v': v_th
      }).rename('FVC');
    fvc1 = fvc1.where(ndvi.lt(s_th), 0.0);
    fvc1 = fvc1.where(ndvi.gt(v_th), 1.0);
    var fvc = image.expression('(fvc1)', { 'fvc1': fvc1 });
    return image.addBands(fvc);
};

// Calculate Land Surface Emissivity (LSE) using NDVI-based method (NBEM)
exports.calcLSE = function(nbem, emissVals) {
  nbem = nbem || 'Skokovic';
  emissVals = emissVals || 'Skokovic';
  var emissivity = getEmissivityValues(emissVals);
  var e_s = emissivity.e_s;
  var e_v = emissivity.e_v;
  var e_w = emissivity.e_w;

  return function(image) {
    var ndvi = image.select('NDVI');
    var red = image.select('SR_B4').multiply(0.0000275).add(-0.2);
    var fvc = image.select('FVC');
    var qa = image.select('QA_PIXEL');
    var water = qa.bitwiseAnd(1 << 7);

    var lse_soil, lse_mixed, lse_veg = e_v;
    var lse; // Declare `lse` outside for consistency.

    switch(nbem) {
        case 'Sobrino':
            lse_soil = image.expression('0.979-0.035*red', { 'red': red });
            lse_mixed = image.expression('0.986+0.004*fvc', { 'fvc': fvc });
            break;
        case 'Yu':
            var ci = image.expression('(1-0.9668)*0.9863*0.55*(1-fvc)', { 'fvc': fvc });
            lse_soil = image.expression('0.973-0.047*red', { 'red': red });
            lse_mixed = image.expression('0.9863*fvc+0.9668*(1-fvc)+ci', { 'fvc': fvc, 'ci': ci });
            lse_veg = image.expression('0.9863+ci', { 'ci': ci });
            break;
        case 'SNDVI':
            lse = image.expression('e_s+(e_v-e_s)*fvc', {
                'fvc': fvc, 'e_s': e_s, 'e_v': e_v
            });
            lse = lse.where(ndvi.gt(v_th), e_v); // Vegetation
            lse = lse.where(ndvi.lt(s_th), e_s); // Soil
            lse = lse.where(water.neq(0), e_w).rename('LSE'); // Water
            return image.addBands(lse); // Return immediately for SNDVI
        default: // Skokovic
            lse_soil = image.expression('0.979-0.046*red', { 'red': red });
            lse_mixed = image.expression('0.987*fvc+0.971*(1-fvc)', { 'fvc': fvc });
    }

    // Default processing for other methods
    lse = lse_mixed.where(ndvi.lt(s_th), lse_soil);
    lse = lse.where(ndvi.gt(v_th), lse_veg);
    lse = lse.where(water.neq(0), e_w).rename('LSE');
    return image.addBands(lse);
  };
};

// Calculate Top of Atmosphere Radiance (LTOA)
exports.calcLTOA = function(image) {
    var tir = image.select(0);
    var ltoa = ee.Algorithms.Landsat.calibratedRadiance(tir).rename('LTOA');
    return image.addBands(ltoa);
};

// Calculate Blackbody Radiance (BTS) from LTOA using RTE inversion
exports.calcBTS = function(image) {
    var tau = image.select('ST_ATRAN').multiply(0.0001);
    var Lu = image.select('ST_URAD').multiply(0.001);
    var Ld = image.select('ST_DRAD').multiply(0.001);
    var ltoa = image.select('LTOA');
    var lse = image.select('LSE');
    var bts = image.expression('((ltoa-Lu-tau*(1-lse)*Ld)/(tau*lse))', {
        'ltoa': ltoa, 'lse': lse, 'tau': tau, 'Lu': Lu, 'Ld': Ld
      }).rename('BTS');
    return image.addBands(bts);
};

// Calculate Land Surface Temperature (LST) in Kelvin from BTS
exports.calcLST = function(K1, K2) {
  return function(image) {
    var bts = image.select('BTS');
    var K_1 = ee.Number(K1);
    var K_2 = ee.Number(K2);
    var lst = image.expression('K2/log(1+K1/bts)', {
        'bts': bts, 'K1': K_1, 'K2': K_2
      }).rename('LST');
    return image.addBands(lst);
  };
};

// Calculate Land Surface Temperature (LST) in Celsius
exports.calcLSTC = function(image) {
    var lst = image.select('LST');
    var lstc = image.expression('(lst-273.15)', {
        'lst': lst
      }).rename('LSTC');
    return image.addBands(lstc);
};

// Calculate Surface Temperature (ST) from Landsat ST band
exports.calcST = function(image) {
  var st_band = image.select(4);
  var st = image.expression('(st_band*0.00341802)+149', {
      'st_band': st_band
    }).rename('ST');
  return image.addBands(st);
};

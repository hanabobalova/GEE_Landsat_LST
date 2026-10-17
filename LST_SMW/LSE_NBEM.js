/*
Author: Sofia Ermida (sofia.ermida@ipma.pt; @ermida_sofia)
Modified by: Hana Bobáľová (hana.bobalova@uniba.sk), Šimon Opravil (simon.opravil@savba.sk)

This code is free and open. 
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
Ermida, S.L., Soares, P., Mantas, V., Göttsche, F.-M., Trigo, I.F., 2020. 
    Google Earth Engine open-source code for Land Surface Temperature estimation from the Landsat series.
    Remote Sensing, 12 (9), 1471; https://doi.org/10.3390/rs12091471

This function computes surface emissivity for Landsat alternatively from ASTER GED 
or using the NDVI-Based Emissivity Method (NBEM).

References:
- Malakar, N.K., Hulley, G.C., Hook, S.J., Laraby, K., Cook, M., Schott, J.R., 2018. 
    An Operational Land Surface Temperature Product for Landsat Thermal Data: Methodology 
    and Validation. IEEE Trans. Geosci. Remote Sens. 56, 5717–5735. 
    https://doi.org/10.1109/TGRS.2018.2824828
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

USES:
    - ASTER_bare_emiss.js

INPUTS:
    - landsat: <string>
        The Landsat satellite ID. Valid inputs: 'L4', 'L5', 'L7', 'L8', 'L9'.
    - lseMethod: <number>
        Determines how emissivity is calculated:
        0: Emissivity is obtained directly from ASTER.
        1: NDVI values are used to obtain dynamic emissivity from ASTER.
        2: Emissivity is calculated using the NDVI-based method (NBEM).
    - nbem: <string>
        Equations used to calculate NDVI-based emissivity. 
        Valid inputs: 'Skoković', 'Sobrino', 'Yu', 'SNDVI'.
    - emissVals: <string>
        Emissivity values of soil and vegetation used in the SNDVI method. 
        Valid inputs: 'Skoković', 'Wang', 'Yu'.
    - image: <ee.Image>
        The image for which to calculate emissivity.

OUTPUTS:
    - <ee.Image>
        The input image with a new band:
        'EM': Surface emissivity of the TIR band.
*/

var ASTERGED = require('users/sofiaermida/landsat_smw_lst:modules/ASTER_bare_emiss.js');

// Define NDVI threshold constants
var s_th = 0.2; // NDVI threshold for bare soil
var v_th = 0.5; // NDVI threshold for vegetation

// Get emissivity values for the SNDVI method
function getEmissivityValues(method) {
    var methods = {
      'Wang': { e_s: 0.966, e_v: 0.973, e_w: 0.991 },
      'Yu': { e_s: 0.9668, e_v: 0.9863, e_w: 0.991 },
      'Skokovic': { e_s: 0.971, e_v: 0.987, e_w: 0.991 }
    };
    return methods[method] || methods['Skokovic'];
}

// Get Landsat-specific coefficients
function getLandsatCoefficients(landsat) {
    var coefficients = {
        'L4': { c13: 0.3222, c14: 0.6498, c: 0.0272 },
        'L5': { c13: -0.0723, c14: 1.0521, c: 0.0195 },
        'L7': { c13: 0.2147, c14: 0.7789, c: 0.0059 },
        'L8': { c13: 0.6820, c14: 0.2578, c: 0.0584 },
        'L9': { c13: 0.6820, c14: 0.2578, c: 0.0584 } // Assuming L9 has the same coefficients as L8
    };
    return coefficients[landsat] || coefficients.default;
}

// Calculate bare soil emissivity using ASTER data
function calculateBareEmissivity(image, coeffs) {
    return image.expression('c13*EM13 + c14*EM14 + c', {
        'EM13': ASTERGED.emiss_bare_band13(image),
        'EM14': ASTERGED.emiss_bare_band14(image),
        'c13': ee.Image(coeffs.c13),
        'c14': ee.Image(coeffs.c14),
        'c': ee.Image(coeffs.c)
    });
}


// Calculate dynamic emissivity
function calculateDynamicEmissivity(image, emiss_bare) {
    var fvc = image.expression('((ndvi-ndvi_bg)/(ndvi_vg - ndvi_bg))**2',
      {'ndvi':image.select('NDVI'),'ndvi_bg':0.2,'ndvi_vg':0.86});
    fvc = fvc.where(fvc.lt(0.0),0.0);
    fvc = fvc.where(fvc.gt(1.0),1.0);
    return image.expression('fvc*0.99+(1-fvc)*em_bare', {
        'fvc': fvc,
        'em_bare': emiss_bare
    });
}

// Calculate ASTER-based emissivity
function calculateAsterEmissivity(image, coeffs) {
  var aster = ee.Image("NASA/ASTER_GED/AG100_003").clip(image.geometry());
  return image.expression('c13*EM13 + c14*EM14 + c', {
    'EM13': aster.select('emissivity_band13').multiply(0.001),
    'EM14': aster.select('emissivity_band14').multiply(0.001),
    'c13': ee.Image(coeffs.c13),
    'c14': ee.Image(coeffs.c14),
    'c': ee.Image(coeffs.c)
  });
}


// Calculate NDVI-based emissivity (NBEM) with different methods
function calculateLSE(image, nbem, emissVals) { 
    nbem = nbem || 'Skokovic';
    emissVals = emissVals || 'Skokovic';
    
    var ndvi = image.select('NDVI');
    var red = image.select('SR_B4').multiply(0.0000275).add(-0.2);
    var fvc = image.select('FVC');
    var qa = image.select('QA_PIXEL');
    var water = qa.bitwiseAnd(1 << 7);
    var emissivityValues = getEmissivityValues(emissVals);
    var e_s = emissivityValues.e_s;
    var e_v = emissivityValues.e_v;
    var e_w = emissivityValues.e_w;
  
    var lse_soil, lse_mixed, lse_veg = e_v;
    var lse; // Declare `lse` outside for consistency.
  
    switch(nbem) {
        case 'Sobrino':
            lse_soil = image.expression('0.979-0.035*red', {'red': red});
            lse_mixed = image.expression('0.986+0.004*fvc', {'fvc': fvc});
            break;
        case 'Yu':
            var ci = image.expression('(1-0.9668)*0.9863*0.55*(1-fvc)', {'fvc': fvc});
            lse_soil = image.expression('0.973-0.047*red', {'red': red});
            lse_mixed = image.expression('0.9863*fvc+0.9668*(1-fvc)+ci', {'fvc': fvc, 'ci': ci});
            lse_veg = image.expression('0.9863+ci', {'ci': ci});
            break;
        case 'SNDVI':
            lse = image.expression('e_s+(e_v-e_s)*fvc', {
                'fvc': fvc,
                'e_s': e_s,
                'e_v': e_v
            });
            lse = lse.where(ndvi.gt(v_th), e_v); // Vegetation
            lse = lse.where(ndvi.lt(s_th), e_s); // Soil
            lse = lse.where(water.neq(0), e_w).rename('LSE'); // Water
            return lse; // Return immediately for SNDVI
        default: // Skokovic
            lse_soil = image.expression('0.979-0.046*red', {'red': red});
            lse_mixed = image.expression('0.987*fvc+0.971*(1-fvc)', {'fvc': fvc});
    }
  
    // Default processing for other methods
    lse = lse_mixed.where(ndvi.lt(s_th), lse_soil);
    lse = lse.where(ndvi.gt(v_th), lse_veg);
    lse = lse.where(water.neq(0), e_w).rename('LSE');
    return lse;
}

// Main function to add emissivity band
exports.addBand = function(landsat, lseMethod, nbem, emissVals) {
  nbem = nbem || 'Skokovic';
  emissVals = emissVals || 'Skokovic';
  return function(image) {
    var coeffs = getLandsatCoefficients(landsat);
    var ndvi = image.select('NDVI');
    var qa = image.select('QA_PIXEL');
    var e_w = getEmissivityValues(emissVals).e_w;

    // Calculate ASTER-based emissivity
    var emiss_bare = calculateBareEmissivity(image, coeffs);
    var EMd = calculateDynamicEmissivity(image, emiss_bare);
    var EM0 = calculateAsterEmissivity(image, coeffs);

    // Calculate NDVI-based emissivity
    var lse = calculateLSE(image, nbem, emissVals);

    // Select appropriate emissivity based on user input
    var EM;
    switch(nbem) {
      case 0:
        EM = EM0;
        break;
      case 1:
        EM = EMd;
        EM = EM.where(qa.bitwiseAnd(1 << 7), 0.99);
        break;
      case 2:
        EM = lse;
        break;
      default:
        EM = lse; // Default to NDVI-based emissivity
    }

    // Apply water and snow/ice masks
    var waterMask = qa.bitwiseAnd(1 << 7);
    var snowMask = qa.bitwiseAnd(1 << 5);

    EM = EM.where(waterMask, e_w)
           .where(snowMask, 0.989);

    return image.addBands(EM.rename('EM'));
  };
};


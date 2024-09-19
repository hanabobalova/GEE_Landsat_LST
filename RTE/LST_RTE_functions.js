/*
Author: Hana Bobalova (hana.bobalova@uniba.sk)

These functions compute the following parameters for the Landsat LST calculation
using the Radiative Transfer Equation (RTE) method,
combined with the NDVI-based emissivity method (NBEM):

NDVI - Normalized Difference Vegetation Index
FVC - Fractional Vegetation Cover
LSE - Land Surface Emissivity
LTOA - Top of Atmosphere Radiance
BTS - blackbody (ground) radiance
LST - Land Surface Temperature (in K)
LSTC - Land Surface Temperature (in degrees Celsius)

Additional function comppute the LST from USGS Landsat ST product
ST - Surface Temperature (in K) 

To call these functions as a processing chain to calculate LST, 
please see the code in Landsat_LST_RTE_NBEM.js.

References to the implemented NDVI and SNDVI threshold methods:

Skoković, D., Sobrino, J.A., Jiménez‐Muñoz, J.C., Sòria, G., Julien, Y., C, M., 
Cristóbal, J., 2014. Calibration and validation of land surface temperature for 
Landsat8-TIRS sensor, in: ESA Land Product Validation and Evolution. Frascati (Italy). 
https://doi.org/10.1063/1.452862

Sobrino, J.A., Jiménez-Muñoz, J.C., Sòria, G., Romaguera, M., Guanter, L., 
Moreno, J., Plaza, A., Martínez, P., 2008. Land surface emissivity retrieval 
from different VNIR and TIR sensors. IEEE Trans. Geosci. Remote Sens. 46, 316–327. 
https://doi.org/10.1109/TGRS.2007.904834

Wang, K., Liang, S., 2009. Evaluation of ASTER and MODIS land surface temperature 
and emissivity products using long-term surface longwave radiation observations 
at SURFRAD sites. Remote Sens. Environ. 113, 1556–1565. 
https://doi.org/10.1016/j.rse.2009.03.009

Yu, X., Guo, X., Wu, Z., 2014. Land surface temperature retrieval from landsat 8 
TIRS-comparison between radiative transfer equation-based method, split window 
algorithm and single channel method. Remote Sens. 6, 9829–9852. 
https://doi.org/10.3390/rs6109829

NDVI-threshold method by Skoković et al. (2014) is selected by default.
To use another method, comment/uncomment the relevant lines of code.

*/



// NBEM settings

// NDVI thresholds
var s_th = 0.2 // NDVIs (bare soil) threshold
var v_th = 0.5 // NDVIv (vegetation) threshold

// emissivity values for SNDVIthm method
// emissivity of bare soil
var e_s = 0.971 // Skokovic et al. (2014) (ASTER library)
//var e_s = 0.9668 // Yu et al. (2014) (MODIS library)
//var e_s = 0.966 // Wang et al. (2015) (ASTER library)
// emissivity of vegetation
var e_v = 0.987 // Skokovic et al. (2014) (ASTER library)
//var e_v = 0.9863 //Yu et al. (2014) (MODIS library)
//var e_v = 0.973 //Wang et al. (2015) (ASTER library)
// emissivity of water
var e_w = 0.991 //Wang et al. (2015) (ASTER library)


// function to calculate NDVI with scaling the reflectance values
exports.calcNDVI = function(image) {
    var nir = 3
    var red = 2
    var ndvi = image.expression('(nir-red)/(nir+red)',{
        'nir':image.select(nir).multiply(0.0000275).add(-0.2),
        'red':image.select(red).multiply(0.0000275).add(-0.2)
      }).rename('NDVI')
    return image.addBands(ndvi)
};

// function to calculate FVC (vegetation fraction) from NDVI
exports.calcFVC = function(image){
    var ndvi = image.select('NDVI')
    var fvc1 = image.expression('((ndvi-ndvi_s)/(ndvi_v - ndvi_s))**2',
    {'ndvi':ndvi,'ndvi_s':s_th,'ndvi_v':v_th}).rename('FVC')
    fvc1 = fvc1.where(fvc1.lt(0.0),0.0)
    fvc1 = fvc1.where(fvc1.gt(1.0),1.0)
    var fvc = image.expression('(fvc1)',
    {'fvc1':fvc1})
    return image.addBands(fvc)
};


// function to calculate LSE - NDVI threshold method by Sobrino et al.(2008)
// please COMMENT out this function to calculate LSE by the SNDVI threshold method
exports.calcLSE = function(image){
    var ndvi = image.select('NDVI')
    var red = image.select(2).multiply(0.0000275).add(-0.2)
    var fvc = image.select('FVC')
    var qa = image.select('QA_PIXEL');
    var water = qa.bitwiseAnd(1 << 7);

    // please uncomment/comment out relevant lines to select the NDVI threshold method
    // Skoković et al. (2014)
    var lse_soil = image.expression('0.979-0.046*red',{'red':red});
    var lse_mixed = image.expression('0.987*fvc+0.971*(1-fvc)',{'fvc':fvc});
    var lse_veg = 0.99
    
    // Sobrino et al. (2008)
    //var lse_soil = image.expression('0.979-0.035*red',{'red':red});
    //var lse_mixed = image.expression('0.986+0.004*fvc',{'fvc':fvc});
    //var lse_veg = 0.99
    
    // Yu et al. (2014)
    //var ci = image.expression('(1-0.9668)*0.9863*0.55*(1-fvc)',{'fvc':fvc});
    //var lse_soil = image.expression('0.973-0.047*red',{'red':red});
    //var lse_mixed = image.expression('0.9863*fvc+0.9668*(1-fvc)+ci',{'fvc':fvc,'ci':ci});
    //var lse_veg = image.expression('0.9863+ci',{'ci':ci});
    
    
    var lse = lse_mixed.where(ndvi.lt(s_th),lse_soil).rename('LSE');
    lse = lse.where(ndvi.gt(v_th),lse_veg); 
    lse = lse.where(water.neq(0),e_w).rename('LSE');
    return image.addBands(lse);
};


// function to calculate LSE - SNDVI threshold method by Sobrino et al.(2008)
// please UNCOMMENT this function to calculate LSE by the SNDVI threshold method
/*
exports.calcLSE = function(image){
    var fvc = image.select('FVC')
    var ndvi = image.select('NDVI')
    var qa = image.select('QA_PIXEL');
    var water = qa.bitwiseAnd(1 << 7).rename('WATER');
    var lse = image.expression('(e_s+(e_v-e_s)*fvc)',
    {'fvc':fvc,'e_s':e_s,'e_v':e_v});
    lse = lse.where(ndvi.gt(v_th),e_v); //vegetation
    lse = lse.where((ndvi.lt(0.2)),e_s); //soil
    lse = lse.where(water.neq(0),e_w).rename('LSE'); //water
    return image.addBands(lse);
};
*/



// function to calculate LTOA from TIR band
exports.calcLTOA = function(image) {
  var tir = image.select(0)
  var ltoa = ee.Algorithms.Landsat.calibratedRadiance(tir).rename('LTOA');
  return image.addBands(ltoa);
};


// function to calculate BTS from LTOA using RTE inversion
exports.calcBTS = function(image) {
  var tau = image.select('ST_ATRAN').multiply(0.0001)
  var Lu = image.select('ST_URAD').multiply(0.001)
  var Ld = image.select('ST_DRAD').multiply(0.001)
  var ltoa = image.select('LTOA')
  var lse = image.select('LSE')
  var bts = image.expression('((ltoa-Lu-tau*(1-lse)*Ld)/(tau*lse))',{
      'ltoa':ltoa,'lse':lse, 'tau':tau, 'Lu': Lu, 'Ld': Ld
    }).rename('BTS'); 
  return image.addBands(bts);
};


// function to calculate LST (in Kelvin) from BTS
exports.calcLST = function(image,K1,K2) {
  var bts = image.select('BTS')
  var K_1 = ee.Number(K1)
  var K_2 = ee.Number(K2)
  var lst = image.expression('K2/log(1+K1/bts)',{
      'bts':bts, 'K1': K_1, 'K2': K_2 }).rename('LST');
  return image.addBands(lst);
};



// function to calculate LST in Celsius
exports.calcLSTC = function(image) {
  var lst = image.select('LST')
  var lstc = image.expression('(lst-273.15)',{
      'lst':lst
    }).rename('LSTC');
  return image.addBands(lstc);
};

// function to calculate LST from Landsat ST band
exports.calcST = function(image) {
  var st_band = image.select(4)
  var st = image.expression('(st_band*0.00341802)+149',{
      'st_band':st_band
    }).rename('ST');
  return image.addBands(st);
};

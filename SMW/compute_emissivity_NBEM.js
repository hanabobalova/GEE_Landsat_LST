/*
Author: Sofia Ermida (sofia.ermida@ipma.pt; @ermida_sofia)

This code is free and open. 
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
Ermida, S.L., Soares, P., Mantas, V., Göttsche, F.-M., Trigo, I.F., 2020. 
    Google Earth Engine open-source code for Land Surface Temperature estimation from the Landsat series.
    Remote Sensing, 12 (9), 1471; https://doi.org/10.3390/rs12091471

this function computes surface emissivity for Landsat
requires values of FVC: compute_FVC.js

ref: Malakar, N.K., Hulley, G.C., Hook, S.J., Laraby, K., Cook, M., Schott, J.R., 2018. 
    An Operational Land Surface Temperature Product for Landsat Thermal Data: Methodology 
    and Validation. IEEE Trans. Geosci. Remote Sens. 56, 5717–5735. 
    https://doi.org/10.1109/TGRS.2018.2824828

Modified by: Hana Bobáľová (hana.bobalova@uniba.sk)
Calculation of the emissivity using NDVI-based methods was added.

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

to call this function use:

var EMfun = require('users/hanele/LST:SMW/compute_emissivity_NBEM.js')
var ImagewithEM = EMfun.addBand(landsat)(image)
or
var collectionwithEM = ImageCollection.map(EMfun.addBand(landsat))

USES:
    - ASTER_bare_emiss.js
    
INPUTS:
        - landsat: <string>
                  the Landsat satellite id
                  valid inputs: 'L4', 'L5', 'L7' and 'L8'
        - use_ndvi: <number>
                if 0, emissivity is obtained directly from ASTER,
                if 1, NDVI values are used to obtain a dynamic emissivity from ASTER,
                if 2, emissivity is calculated using the NDVI-based method 
        - image: <ee.Image>
                image for which to calculate the emissivity
OUTPUTS:
        - <ee.Image>
          the input image with 1 new band: 
          'EM': surface emissivity of TIR band
          
  11-07-2022: update to prescribe emissivity of snow and water surfaces
*/

// 
var ASTERGED = require('users/sofiaermida/landsat_smw_lst:modules/ASTER_bare_emiss.js')


// this function computes the emissivity of the 
// Landsat TIR band using ASTER and FVC
exports.addBand = function(landsat, use_ndvi){
  var wrap = function(image){
    
    var c13 = ee.Number(ee.Algorithms.If(landsat==='L4',0.3222,
                            ee.Algorithms.If(landsat==='L5',-0.0723,
                            ee.Algorithms.If(landsat==='L7',0.2147,
                            0.6820))));
    var c14 = ee.Number(ee.Algorithms.If(landsat==='L4',0.6498,
                            ee.Algorithms.If(landsat==='L5',1.0521,
                            ee.Algorithms.If(landsat==='L7',0.7789,
                            0.2578))));
    var c = ee.Number(ee.Algorithms.If(landsat==='L4',0.0272,
                            ee.Algorithms.If(landsat==='L5',0.0195,
                            ee.Algorithms.If(landsat==='L7',0.0059,
                            0.0584))));
    
    // get ASTER emissivity
    // convolve to Landsat band
    var emiss_bare = image.expression('c13*EM13 + c14*EM14 + c',{
      'EM13':ASTERGED.emiss_bare_band13(image),
      'EM14':ASTERGED.emiss_bare_band14(image),
      'c13':ee.Image(c13),
      'c14':ee.Image(c14),
      'c':ee.Image(c)
      });

    // compute the dynamic emissivity for Landsat
    var EMd = image.expression('fvc*0.99+(1-fvc)*em_bare',
      {'fvc':image.select('FVC'),'em_bare':emiss_bare});
      
    // compute emissivity directly from ASTER
    // without vegetation correction
    // get ASTER emissivity
    var aster = ee.Image("NASA/ASTER_GED/AG100_003")
      .clip(image.geometry());
    var EM0 = image.expression('c13*EM13 + c14*EM14 + c',{
      'EM13':aster.select('emissivity_band13').multiply(0.001),
      'EM14':aster.select('emissivity_band14').multiply(0.001),
      'c13':ee.Image(c13),
      'c14':ee.Image(c14),
      'c':ee.Image(c)
      });
    

    // calculate NDVI-based emissivity
    var ndvi = image.select('NDVI')
    
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

    
    // calculate FVC
    var fvc = image.expression('((ndvi-ndvi_bg)/(ndvi_vg - ndvi_bg))**2',
      {'ndvi':ndvi,'ndvi_bg':s_th,'ndvi_vg':v_th});
    fvc = fvc.where(fvc.lt(0.0),0.0);
    fvc = fvc.where(fvc.gt(1.0),1.0);
    
    // emissivity of mixed surface                    
    var esv = image.expression('(e_s+(e_v-e_s)*fvc)',
    {'fvc':fvc,'e_s':e_s,'e_v':e_v});
    //prescribe emissivity of water bodies
    var qa = image.select('QA_PIXEL');
    var water = qa.bitwiseAnd(1 << 7);
    var NBEM = esv.where(water.eq(1),e_w);
    //prescribe emissivity of vegetation
    NBEM = NBEM.where(ndvi.gt(v_th),e_v); 
    //prescribe emissivity of soil
    NBEM = NBEM.where((water.eq(0).and(ndvi.lt(s_th))),e_s); 

    // calculate LSE - NDVI threshold method by Sobrino et al. (2008)
    // please COMMENT out this function to calculate LSE by the SNDVI threshold method
    var red = image.select('SR_B4').multiply(0.0000275).add(-0.2)
    
    // Skoković et al. (2014)
    //var lse_soil = image.expression('0.979-0.046*red',{'red':red});
    //var lse_mixed = image.expression('0.987*fvc+0.971*(1-fvc)',{'fvc':fvc});
    //var lse_veg = 0.99
    
    // Sobrino et al. (2008)
    //var lse_soil = image.expression('0.979-0.035*red',{'red':red});
    //var lse_mixed = image.expression('0.986+0.004*fvc',{'fvc':fvc});
    //var lse_veg = 0.99
    
    // Yu et al. (2014)
    var ci = image.expression('(1-0.9668)*0.9863*0.55*(1-fvc)',{'fvc':fvc});
    var lse_soil = image.expression('0.973-0.047*red',{'red':red});
    var lse_mixed = image.expression('0.9863*fvc+0.9668*(1-fvc)+ci',{'fvc':fvc,'ci':ci});
    var lse_veg = image.expression('0.9863+ci',{'ci':ci});

    
    var lse = lse_mixed.where(ndvi.lt(s_th),lse_soil);
    lse = lse.where(ndvi.gt(v_th),lse_veg); 
  
    // calculate LSE - SNDVI threshold method by Sobrino et al.(2008)
    // please UNCOMMENT this function to calculate LSE by the SNDVI threshold method
    /*
    var lse = image.expression('(e_s+(e_v-e_s)*fvc)',
    {'fvc':fvc,'e_s':e_s,'e_v':e_v});
    lse = lse.where(ndvi.gt(v_th),e_v); //vegetation
    lse = lse.where((ndvi.lt(0.2)),e_s).rename('LSE'); //soil
    */

    // select which emissivity to output based on user selection
    var EM = ee.Image(ee.Algorithms.If(ee.Algorithms.IsEqual(use_ndvi,0),EM0));
    EM = ee.Image(ee.Algorithms.If(ee.Algorithms.IsEqual(use_ndvi,1),EMd,EM));
    EM = EM.where(qa.bitwiseAnd(1 << 7),0.99);
    
    EM = ee.Image(ee.Algorithms.If(ee.Algorithms.IsEqual(use_ndvi,2),NBEM,EM));
    EM = EM.where(qa.bitwiseAnd(1 << 7),e_w);
    
    // prescribe emissivity of snow/ice bodies
    EM = EM.where(qa.bitwiseAnd(1 << 5),0.989);
    
    return image.addBands(EM.rename('EM'));
  }
  return wrap
}
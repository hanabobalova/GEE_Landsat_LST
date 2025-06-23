// auxiliary functions for the SMW method

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
var s_th = 0.2 // NDVIs (bare soil) threshold
var v_th = 0.5 // NDVIv (vegetation) threshold
exports.calcFVC = function(image){ 
    var ndvi = image.select('NDVI')
    var fvc1 = image.expression('((ndvi-ndvi_s)/(ndvi_v - ndvi_s))**2',
    {'ndvi':ndvi,'ndvi_s':s_th,'ndvi_v':v_th})
    fvc1 = fvc1.where(ndvi.lt(s_th),0.0)
    fvc1 = fvc1.where(ndvi.gt(v_th),1.0)
    var fvc = image.expression('(fvc1)',
    {'fvc1':fvc1}).rename('FVC')
    return image.addBands(fvc)
};

// Landsat TOA cloudmask bits
exports.cm_toa = function(image) {
    var qa = image.select('QA_PIXEL');
    var mask = qa.bitwiseAnd(1 << 3);
    return image.updateMask(mask.not());
};

// Landsat SR cloudmask bits
exports.cm_sr = function(image) {
    var qa = image.select('QA_PIXEL');
    var mask = qa.bitwiseAnd(1 << 3)
      .or(qa.bitwiseAnd(1 << 4))
    return image.updateMask(mask.not());
  };

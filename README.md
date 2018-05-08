## Instalations

Access NPM: https://www.npmjs.com/package/terrabrasilis-api 

```sh

npm install --save terrabrasilis-api

```

## Using the module

#### In Node.js

```sh
var Terrabrasilis = require('terrabrasilis-api');


Terrabrasilis
    .map() 
    .addBaseLayers()
    .addOverLayers()
    .enableDrawFeatureTool()
    .enableLayersControlTool()
    .enableScaleControlTool()
    .enableGeocodingTool();

```

## Release History

Travis CI: [![Build Status](https://travis-ci.org/Terrabrasilis/terrabrasilis-api.svg?branch=master)](https://travis-ci.org/Terrabrasilis/terrabrasilis-api)

* 0.0.1 Initial release 
* 0.0.2 Initial release
* 0.0.3 Initial release
* 0.0.4 Initial release

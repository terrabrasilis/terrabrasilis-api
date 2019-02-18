const { Stack, Queue } = require('terrabrasilis-util');
//require('terrabrasilis-timedimension');

/**
 * This class use the Revealing Module Pattern.
 * 
 * https://scotch.io/bar-talk/4-javascript-design-patterns-you-should-know#module-design-pattern
 */
var Terrabrasilis = (function(){
    /**
     * variables
     */
    let map;        
    let mapScaleStack;
    let redoScaleQueue;
    let baseLayersToShow;
    let overLayersToShow;
    let legendToShow;
    let layerControl;
    let defaultLat = -52.685277;
    let defaultLon = -11.678782;
    let defaultZoom = 5;
    let defaultMapContainer = 'map';
    let constants = {
        PROXY:"http://terrabrasilis.dpi.inpe.br/proxy"    
    };
    let resultsGetFeatureInfo;

    /* dashboard map */
    let info = L.control();
    let legend = L.control({position: 'bottomright'});        
    let grades = [];
    let colors = [];

    /* to control the enable or disable TimeDimension component */
    let _ctrlTimer = {control:null, layer:null, timeDimension:null};
    let _timeConfigLayers = {};// store the default configurations for construct the TimeDimension layers when its needed.
    let _overLayersTD = {};// The created instances of the TimeDimension layers
    let _overLayers = {};// The created instances of the WMS Leaflet Layer.

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Terrabrasilis map
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * this method start the mount terrabrasilis map
     * 
     * @param {*} lat 
     * @param {*} lon 
     * @param {*} zoom 
     */
    let mountMap = function(lat, lon, zoom, container) {
        if(typeof(lat) == 'undefined' || lat === null)
           lat = defaultLat;
        
        if(typeof(lon) == 'undefined' || lon === null)
           lon = defaultLon;
        
        if(typeof(zoom) == 'undefined' || zoom === null)
           zoom = defaultZoom;
        
        if(typeof(container) == 'undefined' || container === null)
           container = defaultMapContainer;

        //icons: https://icons8.com/icon/set/map/metro   
        map = L.map(container, {
            scrollWheelZoom:true,
            fullscreenControl: {
                pseudoFullscreen: false
            },
            contextmenu: true,
            contextmenuWidth: 200,
            contextmenuItems: [{
                text: 'Show coordinates',
                icon: '../../../../assets/img/leaflet/context.menu/whereiam.png',
                callback: showCoordinates
            }, {
                text: 'Center map here',
                icon: '../../../../assets/img/leaflet/context.menu/center.png',
                callback: centerMap 
            }, '-', {
                text: 'GetFeatureInfo',
                icon: '../../../../assets/img/leaflet/context.menu/info.png',
                callback: getLayerFeatureInfo
            }]
        }).setView([lon, lat], zoom);
        
        localStorage.setItem("lat", lat);
        localStorage.setItem("lon", lon);
        localStorage.setItem("zoom", zoom);

        mapScaleStack = Stack;
        redoScaleQueue = Queue;

        map.on('zoomend', function(event) {                          
            options = {
                lat: localStorage.getItem("lat"),
                lng: localStorage.getItem("lon"),
                zoom: map.getZoom()
            };

            //console.log(map);

            mapScaleStack.insert(options);
            redoScaleQueue.insert(options);
            
            //console.log("add scale -> " + map.getZoom());
        });

        resultsGetFeatureInfo = L.layerGroup().addTo(map);
       
        return this;
    }

   
    /**
    * This method is used to mount all base layers to use in the terrabrasilis map
    * @param {*} baseLayersOptions 
    */
    /*
    JSON baselayers example
    [
        {
            "id":"",
            "name":"Google Satellite",
            "title":"Google Satellite",
            "description":"",
            "attribution":"",
            "workspace":"",
            "capabilitiesUrl":"",
            "opacity":0.9,
            "baselayer":true,
            "active":false,
            "enable":true,
            "created":"",
            "datasource":{
                "id":"5c489b1ebbfeb44c9df6aa5c",
                "name":"Google Satellite",
                "description":"Google Satellite",
                "host":"https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
                "metadata":"",
                "enabled":true,
                "created":"2019-01-23 16:49:34",
                "downloads":[

                ],
                "tools":[

                ]
            },
            "tools":[

            ],
            "subdomains":[
                "mt0",
                "mt1",
                "mt2",
                "mt3"
            ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */    
    let mountBaseLayers = function(baseLayersOptions) {
        let styledBaselayers = [];
        let layersGroup = {
            groupName : "BASELAYERS",
            expanded : false
        };
        var baselayers = {};
        
        if(typeof(baseLayersOptions) == 'undefined' || baseLayersOptions === null) {
            //console.log("no objects defined to mount baselayers so using the OSM baselayer to up the app!")
            baselayers = {
                "OSM Default": L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
                                    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
                                        '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ', maxZoom: 18, minZoom: 4 })
            };
            baselayers["OSM Default"].addTo(map);
            layersGroup.layers = baselayers;
            styledBaselayers.push(layersGroup);  
            baseLayersToShow = styledBaselayers;      
            return this;
        }           
        
        for(key in baseLayersOptions) {     
            if (baseLayersOptions.hasOwnProperty(key)) {       
                let bl = baseLayersOptions[key];

                if (bl.baselayer) {
                    let options = {
                        attribution: bl.attribution === null ? "" : bl.attribution,
                        maxZoom: 18,
                        minZoom: 4,                        
                        _name: bl.name,
                        _baselayer: bl.baselayer                    
                    }
                    if (bl.subdomains != null && bl.subdomains.length > 0) {
                        options.subdomains = bl.subdomains;
                    }
                    //console.log(options);
                    let host = bl.datasource == null ? '' : bl.datasource.host;
                    var baselayer = L.tileLayer(host, options);               
                    baselayers[bl.title] = baselayer;
                }
            }                      
        };        
        layersGroup.layers = baselayers;
        styledBaselayers.push(layersGroup);  
        baseLayersToShow = styledBaselayers;        

        for (const key in baseLayersOptions) {
            if (baseLayersOptions.hasOwnProperty(key)) {
                const toShow = baseLayersOptions[key];
                if (toShow.active) {
                    baselayers[toShow.title]
                        .addTo(map)
                        .bringToBack();
                }                 
            }
        }

        return this;
    }

    /**
    * This method is used to mount all base layers to use in the terrabrasilis map
    * @param {*} baseLayersOptions 
    */
    /*
    JSON baselayers example
    [
        {
            "id":"",
            "name":"Google Satellite",
            "title":"Google Satellite",
            "description":"",
            "attribution":"",
            "workspace":"",
            "capabilitiesUrl":"",
            "opacity":0.9,
            "baselayer":true,
            "active":false,
            "enable":true,
            "created":"",
            "datasource":{
                "id":"5c489b1ebbfeb44c9df6aa5c",
                "name":"Google Satellite",
                "description":"Google Satellite",
                "host":"https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
                "metadata":"",
                "enabled":true,
                "created":"2019-01-23 16:49:34",
                "downloads":[

                ],
                "tools":[

                ]
            },
            "tools":[

            ],
            "subdomains":[
                "mt0",
                "mt1",
                "mt2",
                "mt3"
            ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */ 
    let mountCustomizedBaseLayers = function(baseLayersOptions) {
        var baselayers = {};
        
        if(typeof(baseLayersOptions) == 'undefined' || baseLayersOptions === null) {
            //console.log("no objects defined to mount baselayers so using the OSM baselayer to up the app!")
            baselayers = {
                "OSM Default": L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
                                    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
                                        '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ', maxZoom: 18, minZoom: 4 })
            };
            baselayers["OSM Default"].addTo(map);  
            return this;
        }           
        
        for(key in baseLayersOptions) {     
            if (baseLayersOptions.hasOwnProperty(key)) {       
                let bl = baseLayersOptions[key];

                if (bl.baselayer) {
                    let options = {
                        attribution: bl.attribution === null ? "" : bl.attribution,
                        maxZoom: 18,
                        minZoom: 4,
                        _name: bl.name,
                        _baselayer: bl.baselayer                    
                    }
                    if (bl.subdomains != null && bl.subdomains.length > 0) {
                        options.subdomains = bl.subdomains;                        
                    }
                    //console.log(options);
                    let host = bl.datasource == null ? '' : bl.datasource.host;
                    var baselayer = L.tileLayer(host, options);
                    baselayer.setZIndex(0);
                    baselayers[bl.title] = baselayer;
                }
            }                      
        };

        for (const key in baseLayersOptions) {
            if (baseLayersOptions.hasOwnProperty(key)) {
                const toShow = baseLayersOptions[key];
                if (toShow.active) {
                    baselayers[toShow.title]
                        .addTo(map)
                        .bringToBack();
                }                 
            }
        }

        return this;
    }

    /**
     * This method is used to mount all overlayers to use in the terrabrasilis map
     * 
     * @param {*} overLayersOptions 
     */
    /*
    JSON overlayers example
    [
        {
            "id" : "5c49f5bc1a21020001cd6638",
            "name" : "yearly_deforestation_2013_2018",
            "title" : "AMZ Yearly Deforestation",
            "description" : "AMZ Yearly Deforestation",
            "attribution" : "",
            "workspace" : "prodes-amz",
            "capabilitiesUrl" : "",
            "stackOrder" : 2,
            "opacity" : 1.0,
            "baselayer" : false,
            "active" : true,
            "enabled" : true,
            "created" : "2019-01-24 17:28:28",
            "datasource" : {
                "id" : "5c409e920e9b2a0b8424ef1b",
                "name" : "Prodes Amazonia",
                "description" : "Prodes Amazonia",
                "host" : "http://terrabrasilis.dpi.inpe.br/geoserver/ows",
                "metadata" : "",
                "enabled" : true,
                "created" : "2019-01-17 15:26:10",
                "downloads" : [ ],
                "tools" : [ ]
            },
            "tools" : [ ],
            "subdomains" : [ ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */ 
    let mountOverLayers = function(overLayersOptions) {
        let styledOverlayers = [];
        let layersGroup = {
            groupName : "PRODES AMZ",
            expanded : true
        };
        let overlayers = {};

        let legend = L.control.htmllegend({
            position: 'bottomright',            
            collapseSimple: true,
            detectStretched: true,
            collapsedOnInit: true,
            defaultOpacity: 1.0,
            visibleIcon: 'icon icon-eye',
            hiddenIcon: 'icon icon-eye-slash'
        });

        if(typeof(overLayersOptions) == 'undefined' || overLayersOptions === null) {
            overlayers = null;
            //console.log("no objects defined to mount overlayers!")
            return this;
        }           
        
        let zIndexCount = 199;
        for (const key in overLayersOptions) {  
            if (overLayersOptions.hasOwnProperty(key)) {
                const ol = overLayersOptions[key];

                if (!ol.baselayer) {
                    let options = {
                        layers: ol.workspace + ":" + ol.name,
                        format: 'image/png',
                        transparent: true,
			            tiled: true,
                        _name: ol.name,
                        _baselayer: ol.baselayer,
                        zIndex: zIndexCount++
                    }
                    if (ol.subdomains != null) {
                        if (ol.subdomains.length > 0) {
                            // let domains = [];
                            // for (const key in ol.subdomains) {
                            //     if (ol.subdomains.hasOwnProperty(key)) {
                            //         const dm = ol.subdomains[key];
                            //         domains.push(dm.domain);
                            //     }
                            // }                    
                            options.subdomains = ol.subdomains;   
                        }                        
                    }
                    var overlayer = L.tileLayer.wms(ol.host, options);                
                    overlayers[ol.title] = overlayer;

                    legend.addLegend({
                        name: ol.title,
                        layer: overlayer,
                        opacity: ol.opacity,
                        elements: [{
                            //label: 'value' //if define label, the presentation of legend change
                            html: '',
                            style: {
                                'background-color': ol.legend_color,
                                'width': '10px',
                                'height': '10px'
                            }
                        }]
                    });       
                } 
            }                
        };      
        layersGroup.layers = overlayers;
        styledOverlayers.push(layersGroup);  
        overLayersToShow = styledOverlayers;
        legendToShow = legend;

        for (const key in overLayersOptions) {
            if (overLayersOptions.hasOwnProperty(key)) {
                const toShow = overLayersOptions[key];
                if (toShow.active) {
                    overlayers[toShow.title].addTo(map);
                }                
            }
        }

        return this;
    }

    /**
     * This method is used to mount all overlayers to use in the terrabrasilis map
     * About the stackOrder parameter:
     * To control the display order of layers into map use bigger values to putting the layer over the others and the minor values to put below.
     * 
     * @param {*} overLayersOptions 
     */
    /*
    JSON overlayers example
    [
        {
            "id" : "5c49f5bc1a21020001cd6638",
            "name" : "yearly_deforestation_2013_2018",
            "title" : "AMZ Yearly Deforestation",
            "description" : "AMZ Yearly Deforestation",
            "attribution" : "",
            "workspace" : "prodes-amz",
            "capabilitiesUrl" : "",
            "stackOrder" : 2,
            "opacity" : 1.0,
            "baselayer" : false,
            "active" : true,
            "enabled" : true,
            "created" : "2019-01-24 17:28:28",
            "datasource" : {
                "id" : "5c409e920e9b2a0b8424ef1b",
                "name" : "Prodes Amazonia",
                "description" : "Prodes Amazonia",
                "host" : "http://terrabrasilis.dpi.inpe.br/geoserver/ows",
                "metadata" : "",
                "enabled" : true,
                "created" : "2019-01-17 15:26:10",
                "downloads" : [ ],
                "tools" : [ ]
            },
            "tools" : [ ],
            "subdomains" : [ ],
            "metadata":"",
            "dashboard":"",
            "thirdHost":"",
            "uiOrder":0,
            "stackOrder":0,
            "isRemovable":false,
            "hasTranslate":true
        }
    ]
    */
    let mountCustomizedOverLayers = function(overLayersOptions) {
        //let overlayers = {};

        if(typeof(overLayersOptions) == 'undefined' || overLayersOptions === null) {
            _overLayers = null;
            //console.log("no objects defined to mount overlayers!")
            return this;
        }           
        
        for (const key in overLayersOptions) {
            if (overLayersOptions.hasOwnProperty(key)) {
                const ol = overLayersOptions[key];
                //console.log(ol);
                if (!ol.baselayer) {
                    let options = {
                        layers: ol.workspace + ":" + ol.name,
                        format: 'image/png',
                        transparent: true,
			            tiled: true,
                        _name: ol.name,
                        _baselayer: ol.baselayer,
                        zIndex: ol.stackOrder
                    }
                    if (ol.subdomains != null) {
                        if (ol.subdomains.length > 0) {
                            // let domains = [];
                            // for (const key in ol.subdomains) {
                            //     if (ol.subdomains.hasOwnProperty(key)) {
                            //         const dm = ol.subdomains[key];
                            //         domains.push(dm.domain);
                            //     }
                            // }                    
                            options.subdomains = ol.subdomains;   
                        }                        
                    }
                    
                    let host = ol.datasource.host.replace("ows", "gwc/service/wms");
                    var overlayer = L.tileLayer.wms(host, options);                
                    _overLayers[ol.title] = overlayer;
                    if(ol.timeDimension) {
                        // Show one button to enable/disable the TimerControl over map.
                        console.log("The layer "+ol.name+" have time dimension.");
                        _timeConfigLayers[ol.title] = ol;
                    }
                } 
            }                
        };              

        for (const key in overLayersOptions) {
            if (overLayersOptions.hasOwnProperty(key)) {
                const toShow = overLayersOptions[key];
                if (toShow.active) {
                    _overLayers[toShow.title].addTo(map);
                }                
            }
        }

        return this;
    }

    /**
     * Reorders the list layers inside the map to change the layers stacking order on the viewer.
     * Expect the stackOrder numeric parameter for each layer to define the zIndex for each layer inside the map.
     * @param {*} layers One list of layers from external application.
     */
    let reorderOverLayers = function(layers) {
        map.eachLayer(layer => {
            
            let oLayer=layers.find(l => {
                if(l.name===layer.options._name) return l;
            });
            // set zindex into layer of the map reading stackOrder property from the external Layer definition
            if(oLayer){
                layer.setZIndex(oLayer.stackOrder);
            }
        });
    }

    /**
     * this method enables the features highlight
     */
    let geojsonHighlightFeature = function(e) {    
        
        let layer = e.target;
    
        layer.setStyle({
            weight: 5,
            color: '#666',
            dashArray: '',
            fillOpacity: 0.7
        });
    
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
        
        info.update(layer.feature.properties);
    }

    /**
     * this method resets to features highlight
     */
    let geojsonResetHighlight = function(e) {
        var layer = e.target;
        
        layer.setStyle({
            color: '',
            fillOpacity: 0.7
        });
        
        info.update();
    }
    
    /**
     * this method zooms to feature
     */
    let geojsonZoomToFeature = function(e) {     
        map.fitBounds(e.target.getBounds());
    }
    
    /**
     * this method applies handlers on each features
     */
    let onEachFeature = function(feature, layer) {
        
        layer.on({
            mouseover: geojsonHighlightFeature,
            mouseout: geojsonResetHighlight,
            click: geojsonZoomToFeature
        });
        
    }

    /**
     * this method builds info
     */
    let buildInfo = function() {

        // creates an info div 
        info.onAdd = function (map) {
            this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
            this.update();
            return this._div;
        };
        
        // updates a div info
        info.update = function (props) {
            this._div.innerHTML = (props ? '<b>' + props.name + '</b><br/>' + props.density.toFixed(2): 'Hover over a feature');
        };

    }

    /** 
    * this method sets grades values
    */
    let setGradesLegend = function(max, number) {        
        // define initial settings
        var delta = ~~(max/number);         
        grades[0] = 0;
        for (var j = 1;  j <= number; j++) { // repeat number times
            grades[j] = grades[j-1] + delta; // sum grades previous values
        }        
    }

    /** 
    * this method gets grades values
    */
    let getGradesLegend = function() {
        return grades;
    }

    /** 
    * this method set color legend
    */
    let setColorLegend = function(col) {
        colors = col;
    }

    /** 
    * this method gets color legends
    */
    let getColorLegend = function(elem) {  
        
        var index;
        for(var i = grades.length-1; i >= 0; i--){
            if(elem >= grades[i]){
              index = i;
              break;
            }
        }
        return colors[index];
    }

    /** 
    * add legend
    */
    legend.onAdd = function (map) {
        
        var div = L.DomUtil.create('div', 'info legend'); // create a div
    
        // loop through grades intervals and generate a label with a colored square for each interval
        for (var i = 0; i < grades.length; i++) {
            div.innerHTML += '<i style="background:' + colors[i] + '"></i> ' + grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
        }
    
        return div;
    };
    
    /**
     * This method is used to mount geoJson overlayers to use in the terrabrasilis map     
     * 
     * [{
     *      "type":"",     
     *      "name":"",
     *      "active": (true, false),
     *      "style":"",
     *      "features":[]
     *  }]
     */
    let mountGeoJsonLayers = function(geoJson) {
        let overlayers = {};       

        if(typeof(geoJson) == 'undefined' || geoJson === null) {
            overlayers = null;
            //console.log("no objects defined to mount GeoJSON overlayers!")
            return this;
        }           
                
        for (const key in geoJson) {  
            if (geoJson.hasOwnProperty(key)) {
                const ol = geoJson[key];
                
                var overlayer = L.geoJson(ol.features, 
                                         {style: ol.style,
                                          onEachFeature: onEachFeature});
                overlayers[ol.name] = overlayer;
            }                
        };              

        for (const key in geoJson) {
            if (geoJson.hasOwnProperty(key)) {
                const toShow = geoJson[key];
                if (toShow.active) {                    
                    overlayers[toShow.name].addTo(map);
                    buildInfo();
                    info.addTo(map);
                    legend.addTo(map);
                }                
            }
        }

        return this;
    }

    /**
     * this method allow to use the draw tools
     */
    let enableDrawnFeature = function() {
        /**
         * Drawn feature
         */
        let drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        let options = {
            draw: {
                polygon: {
                  allowIntersection: false,
                  drawError: {
                    color: '#e1e100', 
                    message: '<strong>Oh snap!<strong> you can\'t draw that!'
                  },
                  shapeOptions: {
                    clickable: true,
                    showArea: true,
                    color: '#bada55'
                  },
                  showArea: true
                },
                polyline: {
                  shapeOptions: {
                    clickable: true,
                    showArea: true,
                    color: '#f357a1',
                    weight: 7
                  },
                  showArea: true
                },
                rectangle: {
                  shapeOptions: {
                    clickable: true,
                    showArea: true
                  },
                  showArea: true
                },
                circle: false
              },
              metric: true,
              edit: {
                featureGroup: drawnItems,
                edit: true,
                remove: true,
                buffer: {
                    replace_polylines: false,
                    separate_buffer: true,
                    buffer_style: {
                      //renderer: renderer,
                      //color: color,
                      weight: 5,
                      fillOpacity: 0,
                      dashArray: '5, 20'
                    }                
               }
            }
        }

        let drawControl = new L.Control.Draw(options);
        map.addControl(drawControl);

        map.on(L.Draw.Event.CREATED, function(event) {
            let type = event.layerType,  
                layer = event.layer;                        
            //console.log(type);
            //console.log(JSON.stringify(layer.toGeoJSON()));           
            //console.log(toWKT(layer));
            drawnItems.addLayer(layer);
        });
        
        map.on(L.Draw.Event.EDITED, function(event) {
            const editedLayers = event.layers;
            editedLayers.eachLayer(function(l) {
                let wkt = getTerraformerWKT(l);                                              
                //console.log(wkt);
            });
        });

        map.on(L.Draw.Event.DELETED, function(event) {
            const deletedLayers = event.layers;
            
            deletedLayers.eachLayer(function(l) {                
                drawnItems.removeLayer(l);
                //console.log("Deleting feature: ", l);
            });
        });

        return this;
    }

    /**
     * this method enable the leaflet layers control
     */
    let enableLayersControl = function() {        
        /**
         * davicustodio.github.io/Leaflet.StyledLayerControl/examples/example2.html 
         * Using styled layer group 
         */       
        var options = {
            container_width 	: "300px",
            group_maxHeight     : "300px",          
            exclusive       	: true,
            //sortLayers          : true,
            collapsed           : true
        };

        layerControl = L.control.layers(baseLayersToShow, overLayersToShow, options).addTo(map);
        //layerControl = L.Control.styledLayerControl(baseLayersToShow, overLayersToShow, options).addTo(map);    

        return this;
    }

    let enableLegendAndToolToLayers = function() {        
        if(typeof(legendToShow) == 'undefined' || legendToShow === null) {
            overlayers = null;
            return this;
        }

        map.addControl(legendToShow);
        return this;
    }

    /**
     * this method enable the scale leaflet control
     */
    let enableScaleControl = function() {
        L.control.scale().addTo(map); 
        return this;
    }

    /**
     * Enable show coordinates
     */
    let enableDisplayMouseCoordinates = function() {
        L.control.coordinates({
            position:"bottomright",
            decimals:6,
            decimalSeperator:".",
            labelTemplateLat:"Lat: {y}",
            labelTemplateLng:"Lng: {x}"
        }).addTo(map);

        return this;
    }

    /**
     * this method enable search location using esri-leaflet plugin
     */
    let enableGeocodingControl = function () {
        let searchControl = L.esri.Geocoding.geosearch().addTo(map);

        let results = L.layerGroup().addTo(map);

        searchControl.on('results', function(data){
            results.clearLayers();
            //console.log(data);
            for (var i = data.results.length - 1; i >= 0; i--) {
                let marker = L.marker(data.results[i].latlng)
                                .bindPopup('<strong>'+ data.results[i].properties.LongLabel +'</strong>'
                                    + '<br>[ ' + data.results[i].latlng.lat + ' ][ ' + data.results[i].latlng.lng + ' ]').openPopup();
                
                results.addLayer(marker);
            }

            // setTimeout(function(){ 
            //     console.log("cleaning the search result layer");
            //     results.clearLayers();
            // }, 10000);
        });

        return this;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // General tools
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * this method allow to resetView to the initial lat, lon and zoom given by user
     */
    let resetMapToInitialView = function() {
        map.setView([
            localStorage.getItem("lon"),
            localStorage.getItem("lat")],
            localStorage.getItem("zoom"));

        mapScaleStack.reset();
        redoScaleQueue.reset();
        //console.log("Reset stack and queue.");
    } 
    
    /**
     * this method allow do the fullscreen
     */
    let goToFullscreen = function() {
        if(map.isFullscreen()){            
            map.toggleFullscreen();
        } else {            
            map.toggleFullscreen();
        }    
    } 
    
    /**
     * This method return the layer geoJSON data
     * 
     * @param layer 
     */
    let getGeoJSON = function (layer) {
        return layer.toGeoJSON();
    }

    /**
     * http://terraformer.io/
     * 
     * This method receive a WKT string and return the Terraformer GeoJSON
     * 
     * @param wkt 
     */
    let getTerraformerGeoJSON = function (wkt) {
        return Terraformer.WKT.parse(wkt);
    }

    /**
     * http://terraformer.io/
     * 
     * This method receive a GeoJSON string and return the Terraformer WKT
     * 
     * @param layer 
     */
    let getTerraformerWKT = function (layer) {
        return Terraformer.WKT.convert(layer.toGeoJSON().geometry);
    }

    /**
     * This method receive a layer object and return the WKT string 
     * 
     * @param layer 
     */
    let toWKT = function (layer) {
        let lng, lat, coords = [];
        if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
            let latlngs = layer.getLatLngs();
            for (let i = 0; i < latlngs.length; i++) {   
                let latlng = latlngs[i];            
                if(latlng.length){
                    for(let j = 0; j < latlng.length; j++){                    
                        coords.push(latlng[j].lng + " " + latlng[j].lat);               
                        if (j === 0) {
                            lng = latlng[j].lng;
                            lat = latlng[j].lat;
                        }
                    }
                } else {
                    if (i === 0) {
                        lng = latlngs[i].lng;
                        lat = latlngs[i].lat;
                    }
                }
            };
            if (layer instanceof L.Polygon) {
                return "POLYGON((" + coords.join(",") + "," + lng + " " + lat + "))";
            } else if (layer instanceof L.Polyline) {
                return "LINESTRING(" + coords.join(",") + ")";
            }
        } else if (layer instanceof L.Marker) {
            return "POINT(" + layer.getLatLng().lng + " " + layer.getLatLng().lat + ")";
        }
    }

    /**
     * This method show the lat lon - just test with context menu
     * 
     * @param event 
     */
    let showCoordinates = function (event) {
        alert(event.latlng);
    }

    /**
     * This method centralizes the map in the clicked point
     * 
     * @param event 
     */
    let centerMap = function (event) {
        this.setView([event.latlng.lat, event.latlng.lng], localStorage.getItem("zoom"));
    }

    /**
     * This method back to the last scale position
     * 
     * @param {*} event 
     */
    let undo = function () {
        let letsGoTo = mapScaleStack.remove();
        //console.log("undo to -> ");
        //console.log(letsGoTo)
            
        if(letsGoTo !== 'undefined') {
            if(letsGoTo.zoom === map.getZoom())
                letsGoTo = mapScaleStack.remove();            
            map.setView([
                letsGoTo.lng
                , letsGoTo.lat]
                , letsGoTo.zoom);     
        }        
    }

    /**
     * This method allow walking in undo and redo scale map
     * 
     * @param {*} event 
     */
    let redo = function () {
        let letsGoTo = redoScaleQueue.remove();
        //console.log("redo to -> ");
        //console.log(letsGoTo)
            
        if(letsGoTo !== 'undefined') {
            if(letsGoTo.zoom === map.getZoom())
                letsGoTo = redoScaleQueue.remove();        
            map.setView([
                letsGoTo.lng
                , letsGoTo.lat]
                , letsGoTo.zoom);     
        }
    }

    /**
     * This method get the feature layer info (just selected layers)
     * 
     * @param event 
     */
    let getLayerFeatureInfo = function (event, showInPopup) {        
        let urls = getFeatureInfoUrlJson(event);
          
        let divTable = $('<div/>');
        divTable.addClass('table-responsive'); 
        divTable.attr('id', 'getfeatureinfo');
        
        let loading = $('<div/>')
        loading.addClass('lds-dual-ring');
        loading.attr('id', 'loading');
        divTable.append(loading);

        let initialPopup = L.popup({ 
            maxWidth: "auto",
            minWidth: 450
        }).setContent(divTable[0].innerHTML);
        //.setLatLng(event.latlng) 
        //.openOn(map);

        let marker = L.marker(event.latlng).bindPopup(initialPopup, { autoClose: false }).openPopup();
        
        let popup = marker._popup;

        marker.on('click', function(e) {    
            divTable.html('');         
            urls.forEach(url => {                
                let urlToGetInfo = constants.PROXY + "?url=" + encodeURIComponent(url);
                
                let table = $('<table/>')
                table.addClass('table table-striped table-info');
                let tableBody = $('<tbody/>');
                table.append(tableBody);                      
    
                $.get(urlToGetInfo).done(function(data) {
                    //console.log(data);
                    $(popup._contentNode).html(divTable[0].innerHTML);
                    if(data.features.length > 0) {
                        data.features.forEach(element => {      
                            /**
                             * https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
                             */                              
                            if(Object.keys(element.properties).length > 0) {
                                let rowTitle = $('<tr/>');
                                rowTitle.addClass('table-active');
                                let colTitle = $('<td/>')
                                colTitle.attr('colspan', 3);
                                colTitle.append("<b>" + (element.id.split(".")[0]).toUpperCase() + "</b>" );
                                rowTitle.append(colTitle);
                                table.append(rowTitle);
            
                                Object.entries(element.properties).forEach(([key, value]) => {                         
                                    if (value != null) {
                                        let row = $('<tr/>');
                                        let colLeft = $('<td/>');
                                        colLeft.append(key);
                                        let colRight = $('<td/>');
                                        colRight.attr('colspan', 2);
                                        colRight.append(value);
                                        row.append(colLeft);
                                        row.append(colRight);
                                        tableBody.append(row);
                                    }                                
                                });
                            }                                                                                             
                        });                        
                        divTable.append(table);  
                    }

                    if(data.features.length < 0) {                        
                        divTable.append('<p>No data to show!</p>');                        
                    }

                }).fail(function() {                    
                    divTable.append('<p>The server is not responding the request!</p>');                   
                }).always(function() {
                    $(popup._contentNode).html('');
                    loading.remove();
                    $(popup._contentNode).html(divTable[0].innerHTML);    
                    popup._updateLayout();
                    popup._updatePosition();
                }); 
            });            
            return false;
        });
        
        marker.fire('click');
        resultsGetFeatureInfo.addLayer(marker);        
    }

    /**
     * treats the layers url to get feature info
     * 
     * @param {*} event 
     */
    let getFeatureInfoUrl = function (event) {
        let point = map.latLngToContainerPoint(event.latlng, map.getZoom()), 
            size = map.getSize(),
            bounds = map.getBounds();

        let result = [];
        map.eachLayer(layer => {                    
            let iframeTemplate = "<iframe src='#url#' width='450' height='auto' frameborder='0'></iframe>";
            let match = /gwc\/service/;                    
            if(layer.options.layers) {
                defaultParams = {
                    request: 'GetFeatureInfo',
                    service: 'WMS',                    
                    srs: 'EPSG:4326',
                    styles: layer.wmsParams.styles,
                    transparent: layer.wmsParams.transparent,
                    version: layer.wmsParams.version,      
                    format: layer.wmsParams.format,
                    format:'',
                    bbox: bounds.toBBoxString(),
                    height: size.y.toFixed(0),
                    width: size.x.toFixed(0),
                    layers: layer.wmsParams.layers,
                    query_layers: layer.wmsParams.layers,                    
                };

                paramsOptions = {
                    'info_format': 'text/html',
                    //'propertyName': 'NAME,AREA_CODE,DESCRIPTIO'
                }

                params = L.Util.extend(defaultParams, paramsOptions || {});
        
                params[params.version === '1.3.0' ? 'i' : 'x'] = point.x;
                params[params.version === '1.3.0' ? 'j' : 'y'] = point.y;                
                
                let url = match.test(layer._url) == true 
                    ? layer._url.replace("gwc/service", layer.wmsParams.layers.split(':')[0]) : layer._url;                
                result.push(iframeTemplate.replace("#url#", url + L.Util.getParamString(params, url, true)));                    
            }
        }); 
        return result;
    }

    /**
     * treats the layers url to get feature info in JSON format
     * 
     * @param {*} event 
     */
    let getFeatureInfoUrlJson = function (event) {
        let point = map.latLngToContainerPoint(event.latlng, map.getZoom()), 
            size = map.getSize(),
            bounds = map.getBounds();

        let result = [];
        map.eachLayer(layer => {                    
            let match = /gwc\/service/;                
            if(layer.options.layers) {
                defaultParams = {
                    request: 'GetFeatureInfo',
                    service: 'WMS',
                    version: layer.wmsParams.version,      
                    bbox: bounds.toBBoxString(),
                    height: size.y.toFixed(0),
                    width: size.x.toFixed(0),
                    layers: layer.wmsParams.layers,
                    query_layers: layer.wmsParams.layers,
                    typename: layer.wmsParams.layers
                };

                paramsOptions = {
                    'info_format': 'application/json'
                }

                params = L.Util.extend(defaultParams, paramsOptions || {});
        
                params[params.version === '1.3.0' ? 'i' : 'x'] = point.x;
                params[params.version === '1.3.0' ? 'j' : 'y'] = point.y;                
                
                let url = match.test(layer._url) == true 
                    ? layer._url.replace("gwc/service", layer.wmsParams.layers.split(':')[0]) : layer._url;   
                result.push(url + L.Util.getParamString(params, url, true));            
            }
        }); 
        return result;
    }

    /**
     * show a popup to getfeature info
     * 
     * @param {*} err 
     * @param {*} latlng 
     * @param {*} content 
     */
    let showGetFeatureInfo = function (err, latlng, content) {
        if (err) { /*console.log(err);*/ return; } 

        L.popup({ maxWidth:500 })
           .setLatLng(latlng)
           .setContent(content.join(""))
           //.setContent(content)
           .openOn(map);
    }

    /**
     * This method try to find the layer identified by name excluding the Layers with time dimension enabled.
     * 
     * @param {*} layerName 
     */
    let getLayerByName = function(layerName) {
        if(typeof(layerName) == 'undefined' || layerName === null) {            
            //console.log("layerName must not be null!");
            //return this;
            return null;
        } 

        let layer=null;
        map.eachLayer(l => {
            if(l.options._name && l.options._name === layerName && !layer) {
                layer = l;
            }
        });

        return layer;
    }

    /**
     * This method try to find the Layers with time dimension enabled identified by name.
     * 
     * @param {*} layerName 
     */
    let getTimeLayerByName = function(layerName) {
        if(typeof(layerName) == 'undefined' || layerName === null) {            
            return null;
        } 

        let layer;
        map.eachLayer(l => {
            if(l.options._name && l.options.time) {
                let name = l.options._name;
                if (name === layerName) {
                    layer = l;  
                    return true;
                }                
            }
        });

        return layer;
    }

    /**
     * This method ask to the map if the layer is visible
     * 
     * @param {*} layer 
     */
    let isLayerActived = function(layer) {
        if(typeof(layer) == 'undefined' || layer === null) {            
            //console.log("layer must not be null!");
            return false;
        }
        let ll=getLayerByName(layer.name);
        return ( (ll)?(map.hasLayer(ll)):(false) );
    }

    /**
     * This method remove layer from the map
     * 
     * @param {*} layer 
     */
    let deactiveLayer = function(layer) {
        if(!layer || !layer.name) {
            //console.log("layer must not be null!");
            return false;
        }
        if(_ctrlTimer.layer==layer.name) {
            removeTimerControl();
        }
        let ll=getLayerByName(layer.name);
        if(ll) {
            map.removeLayer(ll);
        }
    }

    /**
     * This method add one layer to the map.
     * 
     * @param {*} layer The parameters to instantiate the Leaflet layer and add into map.
     */
    let activeLayer = function(layer) {
        if(typeof(layer) == 'undefined' || layer === null) {
            //console.log("layer must not be null!");
            return this;
        }
        let layers = new Array();
        layer.active = true;
        layers.push(layer);

        layer.baselayer === true 
            ? mountCustomizedBaseLayers(JSON.parse(JSON.stringify(layers))) 
            : mountCustomizedOverLayers(JSON.parse(JSON.stringify(layers)));
    }

    /**
     * This method set the layer opacity
     * 
     * @param {*} layer 
     */
    let setOpacityToLayer = function(layer, value) {
        if(!layer || !value) {
            //console.log("layer must not be null!");
            return false;
        }
        let ll=getLayerByName(layer.name);
        if(ll) ll.setOpacity(value);
    }

    /**
     * This method hide the standard layerControl from leaflet
     */
    let hideStandardLayerControl = function() {
        $( ".leaflet-control-layers" ).hide();
        return this;    
    }

    /**
     * This method receives a layer and move to back from others layers
     */
    let moveLayerToFront = function(layer, value) { 
        let layersOnMap = new Array();  
        let layers = Object.values(layerControl._map._layers);
        for (let index = 0; index < layers.length; index++) {
            const element = layers[index];
            if (element.options.hasOwnProperty("_baselayer")) {
                if(!element.options._baselayer) {
                    layersOnMap.push(element);
                }   
            }
        }             
        //console.log(layersOnMap);

        let ll=getLayerByName(layer.name);
        let layerId = ll._leaflet_id
        for (let index = 0; index < layersOnMap.length; index++) {
            const element = layersOnMap[index];
            if(!(element._leaflet_id === layerId)) {
                if(ll.options.zIndex < element.options.zIndex) {
                    //console.log("moveLayerToFront from [ " + ll.options._name + " ] to [ " + element.options._name + " ]");
                
                    let elementZIndex = element.options.zIndex;
                    let layerZIndex = ll.options.zIndex;

                    ll.setZIndex(elementZIndex);
                    ll.options.zIndex = elementZIndex;

                    element.setZIndex(layerZIndex);
                    element.options.zIndex = layerZIndex;

                    break;
                }
            }
        }        
    }

    /**
     * This method receives a layer and move to from from others layers
     */
    let moveLayerToBack = function(layer, value) {        
        let layersOnMap = new Array();  
        let layers = Object.values(layerControl._map._layers);
        for (let index = 0; index < layers.length; index++) {
            const element = layers[index];
            if (element.options.hasOwnProperty("_baselayer")) {
                if(!element.options._baselayer) {
                    layersOnMap.push(element);
                }   
            }
        }             
        //console.log(layersOnMap);

        let ll=getLayerByName(layer.name);
        let layerId = ll._leaflet_id;
        for (let index = 0; index < layersOnMap.length; index++) {
            const element = layersOnMap[index];
            if(!(element._leaflet_id === layerId)) {
                if(ll.options.zIndex > element.options.zIndex) {
                    //console.log("moveLayerToBack [ " + ll.options._name + " ] to [ " + element.options._name + " ]");
                
                    let elementZIndex = element.options.zIndex;
                    let layerZIndex = ll.options.zIndex;

                    ll.setZIndex(elementZIndex);
                    ll.options.zIndex = elementZIndex;

                    element.setZIndex(layerZIndex);
                    element.options.zIndex = layerZIndex;

                    break;
                }
            }
        }
    }
    
    /**
     * return the selected layers
     */
    let getIdentifyLayers = function () {
        let result = [];
        map.eachLayer(layer => {        
            //console.log(layer);
            if(layer.options._name) {
                result.push(layer);
            }
        });

        return result;
    }

    /**
     * This method iterate under layerControl layers and identify the overlayers
     */
    let getTerrabrasilisOverlayers = function () {
        let result = [];
        
        map.eachLayer(layer => {        
            //console.log(layer);
            //console.log(layer.options);            
            if (layer.options.hasOwnProperty("_baselayer")) {
                if(!layer.options._baselayer) {
                    result.push(layer);
                }   
            }            
        });

        return result;
    }

    /**
     * This method iterate under layerControl layers and identify the baselayers
     */
    let getTerrabrasilisBaselayers = function () {
        let result = [];
        
        map.eachLayer(layer => {        
            if(layer.options._baselayer) {
                //console.log(layer);
                result.push(layer);
            }
        });

        return result;
    }

    /**
     * This method receive the objet with information to add layer on the map dinamically
     * 
     *  {
     *      geospatialHost:  'value',
     *      workspace:       'value',
     *      name:            'value',
     *      active:          'value',
     *  }
     * 
     * @param {*} layerOptions 
     */
    let addLayerByGetCapabilities = function (layerOptions, customized) {
        
        if(layerOptions === 'undefined' || layerOptions == null || layerOptions === '') {
            alert("No data to add layer on the map!");
            return;
        }

        if (!customized) {
            let legend = L.control.htmllegend({
                position: 'bottomleft',            
                collapseSimple: true,
                detectStretched: true,
                collapsedOnInit: true,
                defaultOpacity: 1.0,
                visibleIcon: 'icon icon-eye',
                hiddenIcon: 'icon icon-eye-slash'
            });
           
            let options = layerOptions;
    
            //console.log(options);
    
            let layer = L.tileLayer.wms(options.geospatialHost, {
                layers:  options.workspace + ':' + options.name,
                format: 'image/png',
                transparent: true
            });
    
            legendToShow.addLegend({
                name: options.name,
                layer: layer,
                opacity: 1.0,
                elements: [{
                    label: options.name, 
                    html: '',
                    style: {
                        'background-color': '',
                        'width': '10px',
                        'height': '10px'
                    }
                }]
            });
            
            groupLayer = {
                groupName : "BY GETCAPABILITIES"
            }
    
            //layerControl.addOverlay(layer, options.name);
            layerControl.addOverlay(layer, options.name, groupLayer);
            map.addLayer(layer);
        } 

        if(customized) {
            let ol = layerOptions;
            let options = {
                layers: ol.workspace + ":" + ol.name,
                format: 'image/png',
                transparent: true,
                _name: ol.name,
                _baselayer: ol.baselayer,
                _thirdlayer: true
            }            
            var layer = L.tileLayer.wms(ol.geospatialHost, options); 
                
            layerControl.addOverlay(layer, ol.name);            
            map.addLayer(layer);
        }
    }

    /**
     * This method return the currently map
     */
    let getCurrentlyMap = function () {
        return map;
    }

    /**
     * add GetLayerFeatureInfo event to map
     */
    let addGetLayerFeatureInfoEventToMap = function (event) {        
        /**
         * work with the specific element actived
         */
        let element = event.target;        
        let hasClass = element.classList.contains( "md-off" ); 
        if (hasClass) {            
            /**
             * disable the coordinates tool
             */
            $(".to-manipulate").each(function(idx) {
                let element = this;                     
                element.classList.remove("md-on");
                element.classList.add("md-off");
            });
            map.off("click", showCoordinates);
            $("#map").css('cursor', '');

            /**
             * enable the feature info tool
             */
            element.classList.remove("md-off");
			element.classList.add("md-on");             
            $("#map").addClass("cursor-feature-info"); // this class was located in: style.css file
            map.on("click", getLayerFeatureInfo);              

        } else {
            $(".to-manipulate").each(function(idx) {
                let element = this;                     
                element.classList.remove("md-on");
                element.classList.add("md-off");
            });
            $("#map").removeClass("cursor-feature-info");
            $("#map").css('cursor', '');

            map.off("click", getLayerFeatureInfo);  
            resultsGetFeatureInfo.clearLayers();          
        };                         
    }

    /**
     * add ShowCoordinates event to map
     */
    let addShowCoordinatesEventToMap = function (event) { 
        /**
         * work with the specific element actived
         */       
        let element = event.target;        
        let hasClass = element.classList.contains( "md-off" );   
        if (hasClass) {
            /**
             * disable the coordinates tool
             */
            $(".to-manipulate").each(function(idx) {
                let element = this;
                element.classList.remove("md-on");
                element.classList.add("md-off");
            });
            resultsGetFeatureInfo.clearLayers();
            map.off("click", getLayerFeatureInfo); 
            $("#map").css('cursor', '');

            /**
             * enable the coordinates tool
             */
            element.classList.remove("md-off");
			element.classList.add("md-on");
            $("#map").css('cursor', 'crosshair');
            map.on("click", showCoordinates);                        
        } else {
            $(".to-manipulate").each(function(idx) {
                let element = this;                     
                element.classList.remove("md-on");
                element.classList.add("md-off");
            });
            $("#map").css('cursor', '');

            map.off("click", showCoordinates); 
            resultsGetFeatureInfo.clearLayers();           
        };
    }

    /* Start of the Time Dimension support methods. */

    /**
     * Enable or disable the TimeDimension layer for a WMS layer.
     * @param {string} layerName The name of one layer that is already added in to map.
     */
    let onOffTimeDimension = function(layerName) {
        if(_ctrlTimer.control && _ctrlTimer.layer==layerName) {
            removeTimerControl();
            addLeafletLayer(layerName);
        }else{
            removeTimerControl();
            if(_ctrlTimer.layer!=layerName) {
                addLeafletLayer(_ctrlTimer.layer);
            }
            addTimerControl(layerName);
        }
    }
    
    /**
     * Removes the Leaflet TimeDimension control from the map.
     * Uses the general reference of the last active control only if the _ctrlTimer.layer  it is into the Time Dimension layer list.
     */
    let removeTimerControl = function() {
        if(_ctrlTimer.control){
            var l = getTimeLayer(_ctrlTimer.layer);
            if(l){
                _ctrlTimer.control.remove(map);
                _ctrlTimer.control=null;
                _overLayersTD[l.title].removeFrom(map);
                _ctrlTimer.layer=null;
                _ctrlTimer.timeDimension=null;
            }
        }
    }
    
    /**
     * Add the Time Dimension control into the map for one specific layer.
     * 
     * @param {string} layerName 
     */
    let addTimerControl = function(layerName) {
    
        if(!_ctrlTimer.timeDimension){
            _ctrlTimer.timeDimension = new L.TimeDimension();
        }
        
        var options={
            timeDimension: _ctrlTimer.timeDimension,
            limitSliders: false,
            formatDate: {
                formatMatcher: {year:'numeric',month:'numeric',day:'numeric'},
                locale: 'pt-BR'
            }
        };
        
        _ctrlTimer.control=L.control.timeDimension(options).addTo(map);
        _ctrlTimer.layer=layerName;
        if(addLayerTimeDimension(layerName)){
            console.log("Enable TimeDimension support to the "+layerName+" Layer.");
            return true;
        }else{
            console.log("Failure TimeDimension support to the "+layerName+" Layer.");
            removeTimerControl();
            return false;
        }
    }


    let createLeafletLayerFromConfig = function(layerConfig) {
        let url = layerConfig.datasource.host.replace("ows", "gwc/service/wms");

        return L.tileLayer.wms(url, {
            layers: layerConfig.workspace + ':' + layerConfig.name,
            format: 'image/png',
            transparent: true,
            tiled: true,
            _name: layerConfig.name,
            _baselayer: layerConfig.baselayer,
            zIndex: layerConfig.stackOrder,
            attribution: 'INPE/OBT/DPI/TerraBrasilis'
        });
    }

    let createTimeDimensionLayerFromConfig = function(layerConfig) {
        var tdOptions={
            timeDimension: _ctrlTimer.timeDimension,
            requestTimeFromCapabilities: true,
            getCapabilitiesUrl: layerConfig.datasource.host.replace("ows", layerConfig.workspace + "/" + layerConfig.name+"/ows"),
            setDefaultTime: true,
            getCapabilitiesLayerName: layerConfig.name,
            wmsVersion: "1.3.0",
            proxy: constants.PROXY
        };

        return L.timeDimension.layer.wms(_overLayers[layerConfig.title],tdOptions);
    }
    /**
     * Create TimeDimension Layer if it not exists and add it to map.
     * Before add TimeDimension to map, removes the default Leaflef Layer from the map.
     * 
     * @param {string} layerName, the layer name
     */
    let addLayerTimeDimension = function(layerName) {

        var hasTimeLayer=getTimeLayer(layerName);

        if(hasTimeLayer) {
            
            _overLayers[hasTimeLayer.title].removeFrom(map);// Removing the default Leaflef Layer from the map.

            if(!_overLayersTD[hasTimeLayer.title]){
                _overLayersTD[hasTimeLayer.title] = createTimeDimensionLayerFromConfig(hasTimeLayer);
            }
            _overLayersTD[hasTimeLayer.title].addTo(map);// Adding TimeDimension Layer to the map.
        }
        return hasTimeLayer;
    }

    let addLeafletLayer = function(layerName) {
        var hasTimeLayer=getTimeLayer(layerName);

        if(hasTimeLayer) {
            // create and add new leaflet layer into map
            var leafletLayer=createLeafletLayerFromConfig(hasTimeLayer);
            leafletLayer.addTo(map);
            _overLayers[hasTimeLayer.title] = leafletLayer;
        }
    }

    let getTimeLayer = function(layerName) {
        if(layerName) {
            if(layerName.indexOf(':')>0){
                layerName=layerName.split(':')[1];
            }

            for(key in _timeConfigLayers) {
                if (_timeConfigLayers.hasOwnProperty(key)) {
                    let layer = _timeConfigLayers[key];
                    if(layer.name==layerName) {
                        return layer;
                    }
                }
            }
        }
        return null;
    }

    /* The end of the Time Dimension support methods. */

    let resizeMap = function() {
  	    map.invalidateSize();
    }

    let checkMap = function() {
        return !(map == undefined || map == null);
    }

    let removeMap = function() {
        map.remove();
    }

    /**
     * Enable loading to body
     */
    let enableLoading = function() {
        console.log("Enable loading");
        $("body").loading();
    } 

    /**
     * Disable loading to body
     */
    let disableLoading = function() {
        console.log("Disable loading");
        $('body').loading('stop');
    } 

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // return
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * That return allow the client of this object invoke some method like: Terrabrasilis.mountMap()
     */
    return {

        /**
         * mount map and enable tools, these methods use the fluent interface concepts
         */
        map: mountMap, 
        addBaseLayers: mountBaseLayers,
        addOverLayers: mountOverLayers,
        addCustomizedBaseLayers: mountCustomizedBaseLayers,
        addCustomizedOverLayers: mountCustomizedOverLayers,
        reorderOverLayers: reorderOverLayers,
        addGeoJsonLayers: mountGeoJsonLayers,
        enableDrawFeatureTool: enableDrawnFeature,
        enableLayersControlTool:  enableLayersControl,
        enableScaleControlTool:  enableScaleControl,
        enableGeocodingTool: enableGeocodingControl,
        enableLegendAndToolToLayers: enableLegendAndToolToLayers,
        hideStandardLayerControl: hideStandardLayerControl,
        enableInvalidateSize: resizeMap,
        disableMap: removeMap,
        hasDefinedMap: checkMap,
        setLegend: setGradesLegend,
        getLegend: getGradesLegend,
        setColor: setColorLegend,
        getColor: getColorLegend,
        enableDisplayMouseCoordinates: enableDisplayMouseCoordinates,

        /**
         * general tools
         */
        resetMap: resetMapToInitialView,
        fullScreen: goToFullscreen,
        undo: undo,
        redo: redo,
        getCurrentlyMap: getCurrentlyMap,
        addLayerByGetCapabilities: addLayerByGetCapabilities,
        getTerrabrasilisOverlayers: getTerrabrasilisOverlayers,
        getTerrabrasilisBaselayers: getTerrabrasilisBaselayers,
        getLayerByName: getLayerByName,
        isLayerActived: isLayerActived,
        deactiveLayer: deactiveLayer,
        activeLayer: activeLayer,
        setOpacityToLayer: setOpacityToLayer,
        moveLayerToBack: moveLayerToBack,
        moveLayerToFront: moveLayerToFront,
        addGetLayerFeatureInfoEventToMap: addGetLayerFeatureInfoEventToMap,
        addShowCoordinatesEventToMap: addShowCoordinatesEventToMap,
        enableLoading: enableLoading,
        disableLoading: disableLoading,

        /* TimeDimension tool */
        onOffTimeDimension: onOffTimeDimension
    }
     
})(Terrabrasilis || {});

module.exports = Terrabrasilis;

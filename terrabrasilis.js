const { Stack, Queue } = require('terrabrasilis-util');

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
    let clickToolsActivate = false;
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
        TERRABRASILIS_MAPS_GWC: "http://terrabrasilis.info/fip-service/gwc/service/wms",
        TERRABRASILIS_MAPS_WMS: "http://terrabrasilis.info/fip-service/wms",
        FIPCERRADO_OPERACAO: "http://fipcerrado.dpi.inpe.br:8080/fipcerrado-geoserver/wms",
        FEATURE_INFO_PARAMS: "{0}/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS={1}QUERY_LAYERS={2}&STYLES=BBOX={3}&FEATURE_COUNT=" +
            "&WIDTH={4}&HEIGHT={5}&FORMAT=&INFO_FORMAT={6}&SRS=EPSG:4326&X={7}&Y={8}",
    };
    
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
            
            console.log("add scale -> " + map.getZoom());
        });

        return this;
    }

    /**
     * This method is used to mount all base layers to use in the terrabrasilis map   
     * 
     *  [{
     *      "name":"",
     *      "host":"",
     *      "legend_color":null,
     *      "workspace":"",
     *      "active":false,
     *      "subdomains":[
     *          {
     *             "domain":""
     *          }
     *      ],
     *      "baselayer":true,
     *      "attribution":"",
     *      "opacity": value
     *  }]
     */ 
    let mountBaseLayers = function(baseLayersOptions) {
        let styledBaselayers = [];
        let layersGroup = {
            groupName : "BASELAYERS",
            expanded : false
        };
        var baselayers = {};
        
        if(typeof(baseLayersOptions) == 'undefined' || baseLayersOptions === null) {
            console.log("no objects defined to mount baselayers so using the OSM baselayer to up the app!")
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
                    if (bl.subdomains != null) {
                        let domains = [];
                        for(sd in bl.subdomains) {
                            let dm = bl.subdomains[sd];
                            domains.push(dm.domain);
                        }                    
                        options.subdomains = domains;
                    }
                    //console.log(options);
                    var baselayer = L.tileLayer(bl.host, options);                
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
                    baselayers[toShow.title].addTo(map);
                }                 
            }
        }

        return this;
    }

    /**
     * This method is used to mount all base layers to use in the terrabrasilis map   
     * 
     *  [{
     *      "name":"",
     *      "host":"",
     *      "legend_color":null,
     *      "workspace":"",
     *      "active":false,
     *      "subdomains":[
     *          {
     *             "domain":""
     *          }
     *      ],
     *      "baselayer":true,
     *      "attribution":"",
     *      "opacity": value
     *  }]
     */ 
    let mountCustomizedBaseLayers = function(baseLayersOptions) {
        var baselayers = {};
        
        if(typeof(baseLayersOptions) == 'undefined' || baseLayersOptions === null) {
            console.log("no objects defined to mount baselayers so using the OSM baselayer to up the app!")
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
                    if (bl.subdomains != null) {
                        let domains = [];
                        for(sd in bl.subdomains) {
                            let dm = bl.subdomains[sd];
                            domains.push(dm.domain);
                        }                    
                        options.subdomains = domains;
                    }
                    //console.log(options);
                    var baselayer = L.tileLayer(bl.host, options);
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
     * [{
     *      "title":"",     
     *      "name":"",
     *      "host":"",
     *      "legend_color":"",
     *      "workspace":"",
     *      "active":false,
     *      "subdomain":[],
     *      "baselayer":false,
     *      "attribution": null,
     *      "opacity": value
     *  }]
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
            console.log("no objects defined to mount overlayers!")
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
                        _name: ol.name,
                        _baselayer: ol.baselayer,
                        zIndex: zIndexCount++
                    }
                    if (ol.subdomains != null) {
                        if (ol.subdomains.length > 0) {
                            let domains = [];
                            for (const key in ol.subdomains) {
                                if (ol.subdomains.hasOwnProperty(key)) {
                                    const dm = ol.subdomains[key];
                                    domains.push(dm.domain);
                                }
                            }                    
                            options.subdomains = domains;   
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
     * 
     * [{
     *      "title":"",     
     *      "name":"",
     *      "host":"",
     *      "legend_color":"",
     *      "workspace":"",
     *      "active":false,
     *      "subdomain":[],
     *      "baselayer":false,
     *      "attribution": null,
     *      "opacity": value
     *  }]
     */
    let mountCustomizedOverLayers = function(overLayersOptions) {        
        let overlayers = {};       

        if(typeof(overLayersOptions) == 'undefined' || overLayersOptions === null) {
            overlayers = null;
            console.log("no objects defined to mount overlayers!")
            return this;
        }           
        
        let zIndexCount = 199;
        for (const key in overLayersOptions) {  
            if (overLayersOptions.hasOwnProperty(key)) {
                const ol = overLayersOptions[key];
                //console.log(ol);
                if (!ol.baselayer) {
                    let options = {
                        layers: ol.workspace + ":" + ol.name,
                        format: 'image/png',
                        transparent: true,
                        _name: ol.name,
                        _baselayer: ol.baselayer,
                        zIndex: zIndexCount++
                    }
                    if (ol.subdomains != null) {
                        if (ol.subdomains.length > 0) {
                            let domains = [];
                            for (const key in ol.subdomains) {
                                if (ol.subdomains.hasOwnProperty(key)) {
                                    const dm = ol.subdomains[key];
                                    domains.push(dm.domain);
                                }
                            }                    
                            options.subdomains = domains;   
                        }                        
                    }
                    var overlayer = L.tileLayer.wms(ol.host, options);                
                    overlayers[ol.title] = overlayer;
                } 
            }                
        };              

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
                console.log(wkt);
            });
        });

        map.on(L.Draw.Event.DELETED, function(event) {
            const deletedLayers = event.layers;
            
            deletedLayers.eachLayer(function(l) {                
                drawnItems.removeLayer(l);
                console.log("Deleting feature: ", l);
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
     * this method enable search location using esri-leaflet plugin
     */
    let enableGeocodingControl = function () {
        let searchControl = L.esri.Geocoding.geosearch().addTo(map);

        let results = L.layerGroup().addTo(map);

        searchControl.on('results', function(data){
            results.clearLayers();
            console.log(data);
            for (var i = data.results.length - 1; i >= 0; i--) {
                results.addLayer(
                    L.marker(data.results[i].latlng)
                        .bindPopup('<strong>'+ data.results[i].properties.LongLabel +'</strong>'
                                   + '<br>[ ' + data.results[i].latlng.lat + ' ][ ' + data.results[i].latlng.lng + ' ]')
                );
            }

            setTimeout(function(){ 
                console.log("cleaning the search result layer");
                results.clearLayers();
            }, 10000);
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
        console.log("Reset stack and queue.");
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
        console.log("undo to -> ");
        console.log(letsGoTo)
            
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
        console.log("redo to -> ");
        console.log(letsGoTo)
            
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
        let proxy_url = "http://terrabrasilis2.dpi.inpe.br:7000/cgi-bin/proxy.cgi?url="; 
        let urls = getFeatureInfoUrlJson(event);

        let table = "<div class=\"table-responsive\"><br/>"
            + "<table id=\"getfeatureinfo\" class=\"table table-striped\">"
            + "<tbody></tbody></table></div>";

        L.popup({ 
            maxWidth: "auto",
            minWidth: 450
        }).setLatLng(event.latlng)            
          .setContent(table)
          .openOn(map);

        urls.forEach(url => {
            let urlToGetInfo = proxy_url + encodeURIComponent(url);
            let tableBody = "";      
            $.ajax({
                url: urlToGetInfo,
                async: true,
                success: function (data, status, xhr) {
                    var err = typeof data === 'string' ? null : data;  

                    data.features.forEach(element => {      
                        /**
                         * https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
                         */                       
                        tableBody += "<tr class=\"table-active\">"
                                + "<td colspan=\"3\"><b>"+ (element.id.split(".")[0]).toUpperCase() +"</b></td>"
                                + "</tr>";
                        Object.entries(element.properties).forEach(([key, value]) => { 
                            if (value != null) {
                                tableBody += "<tr>"
                                + "<td>" + key + "</td>"
                                + "<td colspan=\"2\">" + value + "</td>"
                                + "</tr>";
                            }                                
                        });                        
                    }); 
                    $("#getfeatureinfo").last().append(tableBody);

                }, error: function (xhr, status, error) {
                    console.log(error);
                }
            });
        });   
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
        if (err) { console.log(err); return; } 

        L.popup({ maxWidth:500 })
           .setLatLng(latlng)
           .setContent(content.join(""))
           //.setContent(content)
           .openOn(map);
    }

    /**
     * This method try to find the layer identified by name
     * 
     * @param {*} layerName 
     */
    let getLayerByName = function(layerName) {
        if(typeof(layerName) == 'undefined' || layerName === null) {            
            console.log("layerName must not be null!");
            return this;
        } 

        let layer;
        map.eachLayer(l => {                    
            if(l.options._name) {
                let name = l.options._name;
                if (name === layerName) {
                    layer = l;  
                    //console.log(l);
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
            console.log("layer must not be null!");
            return this;
        } 
        return map.hasLayer(layer);
    }

    /**
     * This layer remove layer from the map
     * 
     * @param {*} layer 
     */
    let deactiveLayer = function(layer) {
        if(typeof(layer) == 'undefined' || layer === null) {            
            console.log("layer must not be null!");
            return this;
        }
        map.removeLayer(layer);
    }

    /**
     * This layer add layer to the map
     * 
     * @param {*} layer 
     */
    let activeLayer = function(layer) {
        if(typeof(layer) == 'undefined' || layer === null) {            
            console.log("layer must not be null!");
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
        if(typeof(layer) == 'undefined' || layer === null) {            
            console.log("layer must not be null!");
            return this;
        }
        layer.setOpacity(value);
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

        let layerId = layer._leaflet_id
        for (let index = 0; index < layersOnMap.length; index++) {
            const element = layersOnMap[index];
            if(!(element._leaflet_id === layerId)) {
                if(layer.options.zIndex < element.options.zIndex) {
                    console.log("moveLayerToFront from [ " + layer.options._name + " ] to [ " + element.options._name + " ]");
                
                    let elementZIndex = element.options.zIndex;
                    let layerZIndex = layer.options.zIndex;

                    layer.setZIndex(elementZIndex);
                    layer.options.zIndex = elementZIndex;

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
        
        let layerId = layer._leaflet_id
        for (let index = 0; index < layersOnMap.length; index++) {
            const element = layersOnMap[index];
            if(!(element._leaflet_id === layerId)) {
                if(layer.options.zIndex > element.options.zIndex) {
                    console.log("moveLayerToBack [ " + layer.options._name + " ] to [ " + element.options._name + " ]");
                
                    let elementZIndex = element.options.zIndex;
                    let layerZIndex = layer.options.zIndex;

                    layer.setZIndex(elementZIndex);
                    layer.options.zIndex = elementZIndex;

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
            console.log(layer);
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
            console.log(layer);
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
        //if ( !clickToolsActivate ) {
            let element = event.target;        
            let hasClass = element.classList.contains( "md-off" );        
            
            if (hasClass) {
                $( element ).removeClass( "md-off" ).addClass( "md-on" );
                $("#map").css('cursor', 'crosshair');

                map.on("click", getLayerFeatureInfo);
                clickToolsActivate = true;            
            } else {
                $( element ).removeClass( "md-on" ).addClass( "md-off" );
                $("#map").css('cursor', '');

                map.off("click", getLayerFeatureInfo);
                clickToolsActivate = false;
            };
            
        // } else {
        //     alert("The 'showCoordinates' tool is active, to use 'getFeatureInfo' disable it first!");
        // }                           
    }

    /**
     * add ShowCoordinates event to map
     */
    let addShowCoordinatesEventToMap = function (event) {
        //if ( !clickToolsActivate ) {
            let element = event.target;        
            let hasClass = element.classList.contains( "md-off" );        
            
            if (hasClass) {
                $( element ).removeClass( "md-off" ).addClass( "md-on" );
                $("#map").css('cursor', 'crosshair');

                map.on("click", showCoordinates);
                clickToolsActivate = true;  
            } else {
                $( element ).removeClass( "md-on" ).addClass( "md-off" );
                $("#map").css('cursor', '');

                map.off("click", showCoordinates);
                clickToolsActivate = false;  
            };

        // } else {
        //     alert("The 'getFeatureInfo' tool is active, to use 'showCoordinates' disable it first!");
        // }           
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
        enableDrawFeatureTool: enableDrawnFeature,
        enableLayersControlTool:  enableLayersControl,
        enableScaleControlTool:  enableScaleControl,
        enableGeocodingTool: enableGeocodingControl,
        enableLegendAndToolToLayers: enableLegendAndToolToLayers,
        hideStandardLayerControl: hideStandardLayerControl,

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
        addShowCoordinatesEventToMap: addShowCoordinatesEventToMap
    }
     
})(Terrabrasilis || {});

module.exports = Terrabrasilis;
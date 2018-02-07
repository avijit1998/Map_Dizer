require([
  "esri/Map",
  "esri/views/SceneView",
  "esri/widgets/Locate",
  "esri/widgets/Search",
  "dojo/domReady!"
], function(Map, SceneView, Search, Locate){

  var map = new Map({
    basemap: "satellite",
    ground: "world-elevation"
  });
  var view = new SceneView({
    scale: 123456789,
    container: "viewDiv",  // Reference to the scene div created in step 5
    map: map,  // Reference to the map object created before the scene
    zoom: 4,  // Sets zoom level based on level of detail (LOD)
    center: [77.2090, 28.6139]  // Sets center point of view using longitude,latitude
  });
  var searchWidget = new Search({
        view: view
      });

      // Add the search widget to the very top left corner of the view
      view.ui.add(searchWidget, {
        position: "bottom-right",
        index: 0
      });
      var locateBtn = new Locate({
        view: view
      });

      // Add the locate widget to the top left corner of the view
      view.ui.add(locateBtn, {
        position: "top-right"
      });
});

require([
      "esri/Map",
      "esri/views/MapView",
      "esri/geometry/Polyline",
      "esri/geometry/geometryEngine",
      "esri/Graphic",
      "esri/symbols/SimpleLineSymbol",
      "dojo/domReady!"
    ], function(
      Map, MapView, Polyline, geometryEngine, Graphic, SimpleLineSymbol
    ) {

      // options for configuring and managing
      // measurement and draw tools
      var measureConfig = {
        isActive: false,
        // meters | feet | kilometers | miles | nautical-miles | yards
        units: "kilometers",
        activeFeature: null,
        finsishedFeature: null,
        symbol: new SimpleLineSymbol({
          color: "#21BAED",
          width: 1.5
        })
      };

      var map = new Map({
        basemap: "streets"

      });

      var view = new MapView({
        container: "viewDiv",
        map: map,
        zoom: 8,
        center: [77.2090 ,28.6139 ],
        // use popup to display length measurement
        popup: {
          dockEnabled: true,
          dockOptions: {
            breakpoint: false
          },
          actions: []
        }
      });
      view.ui.add("measure-button", "top-left");

      var measureButton, pointerDownListener, pointerMoveListener,
        doubleClickListener;

      // activate drawing when the measurement button is clicked
      view.then(function() {
        measureButton = document.getElementById("measure-button");
        measureButton.addEventListener("click", function() {
          if (!measureConfig.isActive) {
            activateDraw();
          } else {
            deactivateDraw();
            clearPolyline();
            view.popup.close();
          }
        });

        view.on("click", function(event) {
          // stops the default click behavior in the view
          // (i.e. the popup automatically closes on each
          // mouse click. This overrides that behavior.)
          event.stopPropagation();
        });
      });

      /**
       * Activates the drawing tool. When the draw tool is active, the
       * pointer-down, pointer-move, and double-click events on the
       * view listen for user interaction so drawing
       * and measurement can commence.
       */
      function activateDraw() {
        measureConfig.isActive = true;
        measureButton.classList.toggle("esri-draw-button-selected");

        // clear previously used line features
        clearPolyline();
        measureConfig.finsishedFeature = null;
        view.popup.close();

        // on each pointer-down event, a vertex is added to the line
        // allowing the user to draw a new line segment in continuation
        // of the activeFeature
        pointerDownListener = view.on("pointer-down", addPoint);

        // on each pointer-move event, the last segment of the line
        // is updated so that the final vertex is the location
        // of the pointer or mouse
        pointerMoveListener = view.on("pointer-move", function(event) {
          updateLastVertex(event);
          // measure the polyline on each pointer-move event
          if (measureConfig.activeFeature) {
            measurePolyline(measureConfig.activeFeature.geometry);
          }
        });

        // finishes drawing the line (and measurement) and
        // drawing is deactivated on the view
        doubleClickListener = view.on("double-click", function(event) {
          // stops the default double-click behavior in the view
          event.stopPropagation();
          // stores the final densified version of the polyline
          finishDrawing(event);
          // measures the final polyline
          measurePolyline(measureConfig.finsishedFeature.geometry);
        });
      }

      /**
       * Deactivates drawing on the view. Removes event listeners
       * and clears the polygon from memory
       */
      function deactivateDraw() {
        measureConfig.isActive = false;
        measureConfig.activeFeature = null;
        measureButton.classList.toggle("esri-draw-button-selected");
        pointerDownListener.remove();
        pointerMoveListener.remove();
        doubleClickListener.remove();
      }

      /**
       * Clears the drawn polyline in the view. Only one
       * polyline may be drawn at a time.
       */
      function clearPolyline() {
        var polylineGraphic = view.graphics.find(function(graphic) {
          return graphic.geometry && graphic.geometry.type ===
            "polyline";
        });

        if (polylineGraphic) {
          view.graphics.remove(polylineGraphic);
        }
      }

      /**
       * Adds a point as a vertex to the activeFeature. This finishes
       * drawing one segment of the line and allows the user to commence
       * drawing a new segment from the final vertex of the line.
       *
       * @param {Object} event - Event object containing screen
       *   coordinates of clicked location
       */
      function addPoint(pointerDownEvent) {
        // convert screen coordinates to map coordinates
        var point = view.toMap(pointerDownEvent);
        // creates a line if one doesn't exist
        if (!measureConfig.activeFeature) {
          var line = createLine(point, point);
          measureConfig.activeFeature = new Graphic({
            geometry: line,
            symbol: measureConfig.symbol
          });
          view.graphics.add(measureConfig.activeFeature);
        } else {
          // if a line does exist, add the map point as a vertex to the line
          var newLine = addVertex(measureConfig.activeFeature.geometry,
            point);
          updateFeature(newLine);
        }
      }

      /**
       * Updates the last vertex of the activeFeature on each
       * pointer-move event.
       *
       * @param {Object} pointerMoveEvent - The pointer-move event object.
       */
      function updateLastVertex(pointerMoveEvent) {
        if (measureConfig.activeFeature) {
          var point = view.toMap(pointerMoveEvent);
          var polyline = measureConfig.activeFeature.geometry.clone();
          var lastPointIndex = polyline.paths[0].length - 1;
          var updatedLine = polyline.setPoint(0, lastPointIndex, point);

          updateFeature(updatedLine);
        }
      }

      /**
       * Updates the activeFeature with the given polyline and adds
       * the densified version of the line to the view to show the shortest
       * path between each vertex. The activeFeature is not densified, but
       * can be accurately measured using geometryEngine.geodesicDensify().
       *
       * @param {esri/geometry/Polyline} polyline - The polyline to update
       *   in the app's activeFeature.
       */
      function updateFeature(polyline) {
        clearPolyline();

        // line to measure
        var newFeature = new Graphic({
          geometry: polyline,
          symbol: measureConfig.symbol
        });
        measureConfig.activeFeature = newFeature;

        // line to display in the view. The denisified geometry
        // represents the shortest path between the two vertices
        // of the line segment.
        var densifiedGraphic = newFeature.clone();
        densifiedGraphic.geometry = densifyPolyline(newFeature.geometry);
        view.graphics.add(densifiedGraphic);
      }

      /**
       * Creates a line with a starting and ending position.
       *
       * @param {esri/geometry/Point} startPosition - Start vertex.
       * @param {esri/geometry/Point} endPosition - End vertex.
       *
       * @returns {esri/geometry/Polyline} The resulting polyline.
       */
      function createLine(startPosition, endPosition) {

        var startPointCoordinates = [
          startPosition.x,
          startPosition.y,
        ];
        var endPointCoordinates = [
          endPosition.x,
          endPosition.y,
        ];

        var line = new Polyline({
          spatialReference: {
            wkid: 3857
          },
          hasZ: false,
          hasM: false,
          paths: [
            [
              startPointCoordinates,
              endPointCoordinates
            ]
          ]
        });
        return line;
      }

      /**
       * Adds a vertex to the given line.
       *
       * @param {esri/geometry/Polyline} line - The line to update with the
       *   given vertex.
       * @param   {esri/geometry/Point} newPoint - The point to add as the final
       *   vertex of the line.
       *
       * @return {esri/geometry/Polyline} Returns the updated line.
       */
      function addVertex(line, newPoint) {
        var polyline = line.clone();
        var lastPointIndex = line.paths[0].length;
        polyline.insertPoint(0, lastPointIndex, newPoint);
        return polyline;
      }

      /**
       * Finishes the drawing of the activeFeature and deactivates
       * drawing in the view.
       *
       * @param {object} event [[Description]]
       */
      function finishDrawing(event) {
        var point = event.mapPoint;

        // adds a vertex to the end of the line at the location
        // of the double-click
        var polyline = measureConfig.activeFeature.geometry.clone();
        var finalLine = addVertex(polyline, point);
        updateFeature(finalLine);

        // densifies the final line and adds it to the finishedFeature
        // property of the config object so the user can use it
        // for other purposes if desired.
        var densifiedPolyline = densifyPolyline(finalLine);
        measureConfig.finsishedFeature = new Graphic({
          geometry: densifiedPolyline,
          symbol: measureConfig.symbol
        });

        deactivateDraw();
      }

      /**
       * Measures the given polyline in the units specified in the
       * measureConfig object at the top of the app. The results are
       * displayed in the view's popup.
       *
       * @param {esri/geometry/Polyline} polyline - The polyline to measure.
       *
       * @return {number} Returns the length of the polyline in the
       *   units specified in the measureConfig object.
       */
      function measurePolyline(polyline) {
        // units can be: meters | feet | kilometers | miles | nautical-miles | yards
        var length = geometryEngine.geodesicLength(polyline, measureConfig.units);

        if (!view.popup.visible) {
          view.popup.open({
            title: numberWithCommas(length) + " " + measureConfig.units,
            content: null
          });
        } else {
          view.popup.title = numberWithCommas(length) + " " + measureConfig
            .units
        }
        return length;
      }

      // formats a number to a string with a thousands separator
      function numberWithCommas(x) {
        var rounded = Math.round(x * 100) / 100;
        return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }

      // Uses the geometry engine to geodesically densify a line.
      function densifyPolyline(geometry) {
        return geometryEngine.geodesicDensify(geometry, 100000, "meters");
      }

    });

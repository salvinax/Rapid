import { Color } from 'pixi.js';
import { select as d3_select } from 'd3-selection';
import { RAD2DEG, numWrap, geomPolygonContainsPolygon } from '@rapid-sdk/math';
import throttle from 'lodash-es/throttle.js';

import { uiCmd } from './cmd.js';


/**
 * uiMap3dViewer is a ui panel containing a MapLibre 3D Map
 * @param {*} context
 * @returns
 */
export function uiMap3dViewer(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const map3d = context.systems.map3d;
  const styles = context.systems.styles;
  const urlhash = context.systems.urlhash;
  const viewport = context.viewport;

  function render(selection) {
    let wrap = d3_select(null);
    let _isHidden = !urlhash.getParam('map3d'); // depends on URL hash
    let _lastv;


    function redraw() {
      if (_isHidden) return;
      updateViewport();
      featuresToGeoJSON();
    }


    /**
     * updateViewport
     * Adjust the 3d map to follow the main map, applying any zoom and rotation offsets.
     */
    function updateViewport() {
      const maplibre = map3d.maplibre;
      if (!maplibre) return;              // called too soon?
      if (maplibre.isMoving()) return;    // already moving for other reasons (user interaction?)
      if (viewport.v === _lastv) return;  // main map view hasn't changed

      _lastv = viewport.v;
      const transform = viewport.transform;

      // Why a '-' here?  Because "bearing" is the angle that the user points, not the angle that north points.
      const bearing = numWrap(-transform.r * RAD2DEG, 0, 360);

      maplibre.jumpTo({
        center: viewport.centerLoc(),
        bearing: bearing - map3d.bDiff,
        zoom: transform.zoom - map3d.zDiff
      });
    }


    /**
     * featuresToGeoJSON
     * Collect features in view and issue `setData` calls to update the data in the 3d map.
     */
    function featuresToGeoJSON() {
      const entities = editor.intersects(viewport.visibleExtent());
      const noRelationEnts = entities.filter((ent) => !ent.id.startsWith('r'));

      const buildingEnts = noRelationEnts.filter((ent) => {
        const tags = Object.keys(ent.tags).filter((tagname) =>
          tagname.startsWith('building')
        );
        return tags.length > 0;
      });

      const highwayEnts = noRelationEnts.filter((ent) => {
        const tags = Object.keys(ent.tags).filter((tagname) =>
          tagname.startsWith('highway')
        );
        return tags.length > 0;
      });


      const areaEnts = noRelationEnts.filter((ent) => {
        const tags = Object.keys(ent.tags).filter(
          (tagname) =>
            tagname.startsWith('landuse') ||
            tagname.startsWith('leisure') ||
            tagname.startsWith('natural') ||
            tagname.startsWith('area')
        );
        return tags.length > 0;
      });

      generateRoadLayer(highwayEnts);
      generateBuildingLayer(buildingEnts);
      generateAreaLayer(areaEnts);
    }


    function generateBuildingLayer(buildingEnts) {
      let buildingFeatures = [];
      const selectedIDs = context.selectedIDs();

      const graph = editor.staging.graph;

      for (const buildingEnt of buildingEnts) {
        const gj = buildingEnt.asGeoJSON(graph);
        if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

        // If the building isn't a 'part', check its nodes.
        // If any of THEM have a 'building part' as a way, and if that part is
        // wholly contained in the footprint of this building, then we need to
        // hide this building.

        //Only perform this optiization if there are relatively few buildings to show
        // As this is a very expensive algorithm to run
        if (!buildingEnt.tags['building:part'] && buildingEnts.length < 250) {
          let touchesBuildingPart = false;

          for (let node of buildingEnt.nodes) {
            const parents = graph.parentWays(graph.hasEntity(node));
            for (let way of parents) {
              if (way.tags['building:part'] && geomPolygonContainsPolygon(buildingEnt.nodes.map(n => graph.hasEntity(n).loc), way.nodes.map(n => graph.hasEntity(n).loc))) {
                touchesBuildingPart = true;
                break;
              }
            }
          }

          if (touchesBuildingPart) {
            continue;
          }
        }

        const newFeature = {
          type: 'Feature',
          properties: {
            extrude: true,
            selected: selectedIDs.includes(buildingEnt.id).toString(),
            min_height: buildingEnt.tags.min_height
              ? parseFloat(buildingEnt.tags.min_height)
              : 0,
            height: parseFloat(
              buildingEnt.tags.height ||
              buildingEnt.tags['building:levels'] * 3 ||
              0
            ),
          },
          geometry: gj,
        };

        buildingFeatures.push(newFeature);
      }

      const maplibre = map3d.maplibre;
      const buildingSource = maplibre?.getSource('osmbuildings');

      if (buildingSource) {
        buildingSource.setData({
          type: 'FeatureCollection',
          features: buildingFeatures,
        });
      }
    }


    function generateAreaLayer(areaEnts) {
      let areaFeatures = [];
      const selectedIDs = context.selectedIDs();

      for (const areaEnt of areaEnts) {
        let gj = areaEnt.asGeoJSON(editor.staging.graph);
        if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

        const style = styles.styleMatch(areaEnt.tags, areaEnt.id);
        const fillColor = new Color(style.fill.color).toHex();
        const strokeColor = new Color(style.stroke.color).toHex();

        const newFeature = {
          type: 'Feature',
          properties: {
            selected: selectedIDs.includes(areaEnt.id).toString(),
            fillcolor: fillColor,
            strokecolor: strokeColor,
          },
          geometry: gj,
        };

        areaFeatures.push(newFeature);
      }

      const maplibre = map3d.maplibre;
      const areaSource = maplibre?.getSource('osmareas');

      if (areaSource) {
        areaSource.setData({
          type: 'FeatureCollection',
          features: areaFeatures,
        });
      }
    }


    function generateRoadLayer(roadEnts) {
      let roadFeatures = [];
      const selectedIDs = context.selectedIDs();

      for (const roadEnt of roadEnts) {
        const gj = roadEnt.asGeoJSON(editor.staging.graph);
        if (gj.type !== 'LineString') continue;

        const style = styles.styleMatch(roadEnt.tags, roadEnt.id);
        const casingColor = new Color(style.casing.color).toHex();
        const strokeColor = new Color(style.stroke.color).toHex();

        const newFeature = {
          type: 'Feature',
          properties: {
            selected: selectedIDs.includes(roadEnt.id).toString(),
            highway: roadEnt.tags.highway,
            casingColor: casingColor,
            strokeColor: strokeColor,
          },
          geometry: gj,
        };

        roadFeatures.push(newFeature);
      }

      const maplibre = map3d.maplibre;
      const roadSource = maplibre?.getSource('osmroads');

      if (roadSource) {
        roadSource.setData({
          type: 'FeatureCollection',
          features: roadFeatures,
        });
      }
    }


    function toggle(d3_event) {
      if (d3_event) d3_event.preventDefault();

      _isHidden = !_isHidden; // update the value of _isHidden

      context
        .container()
        .select('.three-d-map-toggle-item')
        .classed('active', !_isHidden)
        .select('input')
        .property('checked', !_isHidden);

      if (_isHidden) {
        wrap
          .style('display', 'block')
          .style('opacity', '1')
          .transition()
          .duration(200)
          .style('opacity', '0')
          .on('end', () =>
            selection.selectAll('.three-d-map').style('display', 'none')
          );
        urlhash.setParam('map3d', null);
      } else {
        wrap
          .style('display', 'block')
          .style('opacity', '0')
          .transition()
          .duration(200)
          .style('opacity', '1')
          .on('end', () => redraw());
        urlhash.setParam('map3d', 'true');
      }
    }

    /* setup */
    uiMap3dViewer.toggle = toggle;

    wrap = selection.selectAll('.three-d-map').data([0]);

    let wrapEnter = wrap
      .enter()
      .append('div')
      .attr('class', 'three-d-map')
      .attr('id', '3d-buildings')
      .style('display', _isHidden ? 'none' : 'block');

    wrap = wrapEnter.merge(wrap);
    map3d.startAsync();


    const deferredRedraw = throttle(redraw, 50, { leading: true, trailing: true });

    map.on('draw', deferredRedraw);
    map.on('move', deferredRedraw);
    context.keybinding().on([uiCmd('⌘' + l10n.t('background.3dmap.key'))], toggle);

    redraw();
  }

  return render;
}

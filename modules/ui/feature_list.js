import * as d3 from 'd3';
import * as sexagesimal from '@mapbox/sexagesimal';
import { t } from '../util/locale';
import { geoExtent, geoChooseEdge } from '../geo/index';
import { modeSelect } from '../modes/index';
import { EntityStatics } from '../osm/index';
import { svgIcon } from '../svg/index';
import { services } from '../services/index';

import {
    utilDisplayName,
    utilDisplayType,
    utilEntityOrMemberSelector,
    utilNoAuto
} from '../util/index';


export function uiFeatureList(context) {
    var geocodeResults;


    function featureList(selection) {
        var header = selection
            .append('div')
            .attr('class', 'header fillL cf');

        header.append('h3')
            .text(t('inspector.feature_list'));

        var searchWrap = selection
            .append('div')
            .attr('class', 'search-header');

        var search = searchWrap
            .append('input')
            .attr('placeholder', t('inspector.search'))
            .attr('type', 'search')
            .call(utilNoAuto)
            .on('keypress', keypress)
            .on('input', inputevent);

        searchWrap
            .call(svgIcon('#icon-search', 'pre-text'));

        var listWrap = selection
            .append('div')
            .attr('class', 'inspector-body');

        var list = listWrap
            .append('div')
            .attr('class', 'feature-list cf');

        context
            .on('exit.feature-list', clearSearch);
        context.map()
            .on('drawn.feature-list', mapDrawn);


        function keypress() {
            var q = search.property('value'),
                items = list.selectAll('.feature-list-item');
            if (d3.event.keyCode === 13 && q.length && items.size()) {
                click(items.datum());
            }
        }


        function inputevent() {
            geocodeResults = undefined;
            drawList();
        }


        function clearSearch() {
            search.property('value', '');
            drawList();
        }


        function mapDrawn(e) {
            if (e.full) {
                drawList();
            }
        }


        function features() {
            var entities = {},
                result = [],
                graph = context.graph(),
                q = search.property('value').toLowerCase();

            if (!q) return result;

            var idMatch = q.match(/^([nwr])([0-9]+)$/);

            if (idMatch) {
                result.push({
                    id: idMatch[0],
                    geometry: idMatch[1] === 'n' ? 'point' : idMatch[1] === 'w' ? 'line' : 'relation',
                    type: idMatch[1] === 'n' ? t('inspector.node') : idMatch[1] === 'w' ? t('inspector.way') : t('inspector.relation'),
                    name: idMatch[2]
                });
            }

            var locationMatch = sexagesimal.pair(q.toUpperCase()) || q.match(/^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/);

            if (locationMatch) {
                var loc = [parseFloat(locationMatch[0]), parseFloat(locationMatch[1])];
                result.push({
                    id: -1,
                    geometry: 'point',
                    type: t('inspector.location'),
                    name: loc[0].toFixed(6) + ', ' + loc[1].toFixed(6),
                    location: loc
                });
            }

            function addEntity(entity) {
                if (entity.id in entities || result.length > 200)
                    return;

                entities[entity.id] = true;

                var name = utilDisplayName(entity) || '';
                if (name.toLowerCase().indexOf(q) >= 0) {
                    var matched = context.presets().match(entity, graph),
                        type = (matched && matched.name()) || utilDisplayType(entity.id);
                    result.push({
                        id: entity.id,
                        entity: entity,
                        geometry: context.geometry(entity.id),
                        type: type,
                        name: name
                    });
                }

                graph.parentRelations(entity).forEach(function(parent) {
                    addEntity(parent);
                });
            }

            var visible = context.surface().selectAll('.point, .line, .area').nodes();
            for (var i = 0; i < visible.length && result.length <= 200; i++) {
                addEntity(visible[i].__data__);
            }

            (geocodeResults || []).forEach(function(d) {
                // https://github.com/openstreetmap/iD/issues/1890
                if (d.osm_type && d.osm_id) {
                    result.push({
                        id: EntityStatics.id.fromOSM(d.osm_type, d.osm_id),
                        geometry: d.osm_type === 'relation' ? 'relation' : d.osm_type === 'way' ? 'line' : 'point',
                        type: d.type !== 'yes' ? (d.type.charAt(0).toUpperCase() + d.type.slice(1)).replace('_', ' ')
                                               : (d.class.charAt(0).toUpperCase() + d.class.slice(1)).replace('_', ' '),
                        name: d.display_name,
                        extent: new geoExtent(
                            [parseFloat(d.boundingbox[3]), parseFloat(d.boundingbox[0])],
                            [parseFloat(d.boundingbox[2]), parseFloat(d.boundingbox[1])])
                    });
                }
            });

            return result;
        }


        function drawList() {
            var value = search.property('value'),
                results = features();

            list.classed('filtered', value.length);

            var noResultsWorldwide = geocodeResults && geocodeResults.length === 0;

            var resultsIndicator = list.selectAll('.no-results-item')
                .data([0])
                .enter().append('button')
                .property('disabled', true)
                .attr('class', 'no-results-item')
                .call(svgIcon('#icon-alert', 'pre-text'));

            resultsIndicator.append('span')
                .attr('class', 'entity-name');

            list.selectAll('.no-results-item .entity-name')
                .text(noResultsWorldwide ? t('geocoder.no_results_worldwide') : t('geocoder.no_results_visible'));

            if (services.geocoder) {
              list.selectAll('.geocode-item')
                  .data([0])
                  .enter().append('button')
                  .attr('class', 'geocode-item')
                  .on('click', geocoderSearch)
                  .append('div')
                  .attr('class', 'label')
                  .append('span')
                  .attr('class', 'entity-name')
                  .text(t('geocoder.search'));
            }

            list.selectAll('.no-results-item')
                .style('display', (value.length && !results.length) ? 'block' : 'none');

            list.selectAll('.geocode-item')
                .style('display', (value && geocodeResults === undefined) ? 'block' : 'none');

            list.selectAll('.feature-list-item')
                .data([-1])
                .remove();

            var items = list.selectAll('.feature-list-item')
                .data(results, function(d) { return d.id; });

            var enter = items.enter()
                .insert('button', '.geocode-item')
                .attr('class', 'feature-list-item')
                .on('mouseover', mouseover)
                .on('mouseout', mouseout)
                .on('click', click);

            var label = enter
                .append('div')
                .attr('class', 'label');

            label.each(function(d) {
                d3.select(this)
                    .call(svgIcon('#icon-' + d.geometry, 'pre-text'));
            });

            label.append('span')
                .attr('class', 'entity-type')
                .text(function(d) { return d.type; });

            label.append('span')
                .attr('class', 'entity-name')
                .text(function(d) { return d.name; });

            enter.style('opacity', 0)
                .transition()
                .style('opacity', 1);

            items.order();

            items.exit()
                .remove();
        }


        function mouseover(d) {
            if (d.id === -1) return;

            context.surface().selectAll(utilEntityOrMemberSelector([d.id], context.graph()))
                .classed('hover', true);
        }


        function mouseout() {
            context.surface().selectAll('.hover')
                .classed('hover', false);
        }


        function click(d) {
            d3.event.preventDefault();
            if (d.location) {
                context.map().centerZoom([d.location[1], d.location[0]], 20);
            }
            else if (d.entity) {
                if (d.entity.type === 'node') {
                    context.map().center(d.entity.loc);
                } else if (d.entity.type === 'way') {
                    var center = context.projection(context.map().center()),
                        edge = geoChooseEdge(context.childNodes(d.entity), center, context.projection);
                    context.map().center(edge.loc);
                }
                context.enter(modeSelect(context, [d.entity.id]));
            } else {
                context.zoomToEntity(d.id);
            }
        }


        function geocoderSearch() {
            services.geocoder.search(search.property('value'), function (err, resp) {
                geocodeResults = resp || [];
                drawList();
            });
        }
    }


    return featureList;
}

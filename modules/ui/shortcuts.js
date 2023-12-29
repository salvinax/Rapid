import { select as d3_select } from 'd3-selection';
import { utilArrayUniq } from '@rapid-sdk/util';

import { uiIcon } from './icon';
import { uiCmd } from './cmd';
import { uiModal } from './modal';
import { utilDetect } from '../util/detect';


export function uiShortcuts(context) {
    const l10n = context.systems.l10n;

    var detected = utilDetect();
    var _activeTab = 0;
    var _modalSelection;
    var _selection = d3_select(null);
    var _dataShortcuts;


    function shortcutsModal(_modalSelection) {
        _modalSelection.select('.modal')
            .classed('modal-shortcuts', true);

        var content = _modalSelection.select('.content');

        content
            .append('div')
            .attr('class', 'modal-section')
            .append('h3')
            .html(l10n.tHtml('shortcuts.title'));

        const dataloader = context.systems.dataloader;
        dataloader.getDataAsync('shortcuts')
          .then(data => {
            _dataShortcuts = data;
            content.call(render);
          })
          .catch(e => console.error(e));  // eslint-disable-line
    }


    function render(selection) {
        if (!_dataShortcuts) return;

        var wrapper = selection
            .selectAll('.wrapper')
            .data([0]);

        var wrapperEnter = wrapper
            .enter()
            .append('div')
            .attr('class', 'wrapper modal-section');

        var tabsBar = wrapperEnter
            .append('div')
            .attr('class', 'tabs-bar');

        var shortcutsList = wrapperEnter
            .append('div')
            .attr('class', 'shortcuts-list');

        wrapper = wrapper.merge(wrapperEnter);

        var tabs = tabsBar
            .selectAll('.tab')
            .data(_dataShortcuts);

        var tabsEnter = tabs
            .enter()
            .append('a')
            .attr('class', 'tab')
            .attr('href', '#')
            .on('click', function (d3_event, d) {
                d3_event.preventDefault();
                var i = _dataShortcuts.indexOf(d);
                _activeTab = i;
                render(selection);
            });

        tabsEnter
            .append('span')
            .html(function (d) { return l10n.tHtml(d.text); });

        // Update
        wrapper.selectAll('.tab')
            .classed('active', function (d, i) {
                return i === _activeTab;
            });


        var shortcuts = shortcutsList
            .selectAll('.shortcut-tab')
            .data(_dataShortcuts);

        var shortcutsEnter = shortcuts
            .enter()
            .append('div')
            .attr('class', function(d) { return 'shortcut-tab shortcut-tab-' + d.tab; });

        var columnsEnter = shortcutsEnter
            .selectAll('.shortcut-column')
            .data(function (d) { return d.columns; })
            .enter()
            .append('table')
            .attr('class', 'shortcut-column');

        var rowsEnter = columnsEnter
            .selectAll('.shortcut-row')
            .data(function (d) { return d.rows; })
            .enter()
            .append('tr')
            .attr('class', 'shortcut-row');


        var sectionRows = rowsEnter
            .filter(function (d) { return !d.shortcuts; });

        sectionRows
            .append('td');

        sectionRows
            .append('td')
            .attr('class', 'shortcut-section')
            .append('h3')
            .html(function (d) { return l10n.tHtml(d.text); });


        var shortcutRows = rowsEnter
            .filter(function (d) { return d.shortcuts; });

        var shortcutKeys = shortcutRows
            .append('td')
            .attr('class', 'shortcut-keys');

        var modifierKeys = shortcutKeys
            .filter(function (d) { return d.modifiers; });

        modifierKeys
            .selectAll('kbd.modifier')
            .data(function (d) {
                if (detected.os === 'win' && d.text === 'shortcuts.editing.commands.redo') {
                    return ['⌃'];
                } else if (detected.os !== 'mac' && d.text === 'shortcuts.browsing.display_options.fullscreen') {
                    return [];
                } else {
                    return d.modifiers;
                }
            })
            .enter()
            .each(function () {
                var selection = d3_select(this);

                selection
                    .append('kbd')
                    .attr('class', 'modifier')
                    .text(d => uiCmd.display(context, d));

                selection
                    .append('span')
                    .text('+');
            });


        shortcutKeys
            .selectAll('kbd.shortcut')
            .data(function (d) {
                var arr = d.shortcuts;
                if (detected.os === 'win' && d.text === 'shortcuts.editing.commands.redo') {
                    arr = ['Y'];
                } else if (detected.os !== 'mac' && d.text === 'shortcuts.browsing.display_options.fullscreen') {
                    arr = ['F11'];
                }

                // replace translations
                arr = arr.map(s => {
                    return uiCmd.display(context, s.indexOf('.') !== -1 ? l10n.t(s) : s);
                });

                return utilArrayUniq(arr).map(function(s) {
                    return {
                        shortcut: s,
                        separator: d.separator,
                        suffix: d.suffix,
                        rapid: d.rapid
                    };
                });
            })
            .enter()
            .each(function (d, i, nodes) {
                var selection = d3_select(this);
                var click = d.shortcut.toLowerCase().match(/(.*).click/);

                if (click && click[1]) {   // replace "left_click", "right_click" with mouse icon
                    selection
                        .call(uiIcon('#rapid-walkthrough-mouse-' + click[1], 'operation'));
                } else if (d.shortcut.toLowerCase() === 'long-press') {
                    selection
                        .call(uiIcon('#rapid-walkthrough-longpress', 'longpress operation'));
                } else if (d.shortcut.toLowerCase() === 'tap') {
                    selection
                        .call(uiIcon('#rapid-walkthrough-tap', 'tap operation'));
                } else {
                    selection
                        .append('kbd')
                        .attr('class', 'shortcut')
                        .html(function (d) { return d.shortcut; });
                }

                if (i < nodes.length - 1) {
                    selection
                        .append('span')
                        .html(d.separator || '\u00a0' + l10n.tHtml('shortcuts.or') + '\u00a0');
                } else if (i === nodes.length - 1 && d.suffix) {
                    selection
                        .append('span')
                        .html(d.suffix);
                }

                if (d.rapid && i === 0){
                    selection
                        .append('svg')
                        .lower()
                        .attr('class', 'icon logo-rapid')
                        .append('use')
                        .attr('xlink:href', '#rapid-logo-rapid')
                        .attr('class', '#rapid-logo-rapid');
                }
            });


        shortcutKeys
            .filter(function(d) { return d.gesture; })
            .each(function () {
                var selection = d3_select(this);

                selection
                    .append('span')
                    .html('+');

                selection
                    .append('span')
                    .attr('class', 'gesture')
                    .html(function (d) { return l10n.tHtml(d.gesture); });
            });


        shortcutRows
            .append('td')
            .attr('class', 'shortcut-desc')
            .html(function (d) { return d.text ? l10n.tHtml(d.text) : '\u00a0'; });


        // Update
        wrapper.selectAll('.shortcut-tab')
            .style('display', function (d, i) {
                return i === _activeTab ? 'flex' : 'none';
            });
    }


    return function(selection, show) {
        _selection = selection;
        if (show) {
            _modalSelection = uiModal(selection);
            _modalSelection.call(shortcutsModal);
        } else {
            context.keybinding()
                .on([l10n.t('shortcuts.toggle.key'), '?'], function () {
                    if (context.container().selectAll('.modal-shortcuts').size()) {  // already showing
                        if (_modalSelection) {
                            _modalSelection.close();
                            _modalSelection = null;
                        }
                    } else {
                        _modalSelection = uiModal(_selection);
                        _modalSelection.call(shortcutsModal);
                    }
                });
        }
    };
}

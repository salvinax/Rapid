import { select as d3_select } from 'd3-selection';

import { t } from '../core/localizer';
import { behaviorLasso } from '../behavior/lasso';
import { BehaviorSelect } from '../behavior/BehaviorSelect';
import { modeBrowse } from './browse';
import { modeDragNode } from './drag_node';
import { modeDragNote } from './drag_note';
import { services } from '../services';
import { uiNoteEditor } from '../ui/note_editor';
import { utilKeybinding } from '../util';


export function modeSelectNote(context, selectedNoteID) {
    var mode = {
        id: 'select-note',
        button: 'browse'
    };

    var _keybinding = utilKeybinding('select-note');
    var _noteEditor = uiNoteEditor(context)
        .on('change', function() {
            context.map().immediateRedraw();
            var note = checkSelectedID();
            if (!note) return;
            context.ui().sidebar
                .show(_noteEditor.note(note));
        });

    var _behaviors = [
        new BehaviorSelect(context),
        behaviorLasso(context),
        modeDragNode(context).behavior,
        modeDragNote(context).behavior
    ];

    var _newFeature = false;


    function checkSelectedID() {
        if (!services.osm) return;
        var note = services.osm.getNote(selectedNoteID);
        if (!note) {
            context.enter(modeBrowse(context));
        }
        return note;
    }


    // class the note as selected, or return to browse mode if the note is gone
    function selectNote(d3_event, drawn) {
        if (!checkSelectedID()) return;

        var selection = context.surface().selectAll('.layer-notes .note-' + selectedNoteID);

        if (selection.empty()) {
            // Return to browse mode if selected DOM elements have
            // disappeared because the user moved them out of view..
            var source = d3_event && d3_event.type === 'zoom' && d3_event.sourceEvent;
            if (drawn && source && (source.type === 'pointermove' || source.type === 'mousemove' || source.type === 'touchmove')) {
                context.enter(modeBrowse(context));
            }

        } else {
            selection
                .classed('selected', true);

            context.selectedNoteID(selectedNoteID);
        }
    }


    function esc() {
        if (context.container().select('.combobox').size()) return;
        context.enter(modeBrowse(context));
    }


    mode.zoomToSelected = function() {
        if (!services.osm) return;
        var note = services.osm.getNote(selectedNoteID);
        if (note) {
            context.map().centerZoomEase(note.loc, 20);
        }
    };


    mode.newFeature = function(val) {
        if (!arguments.length) return _newFeature;
        _newFeature = val;
        return mode;
    };


    mode.enter = function() {
        var note = checkSelectedID();
        if (!note) return;

        _behaviors.forEach(context.install);

        _keybinding
            .on(t('inspector.zoom_to.key'), mode.zoomToSelected)
            .on('⎋', esc, true);

        d3_select(document)
            .call(_keybinding);

        selectNote();

        var sidebar = context.ui().sidebar;
        sidebar.show(_noteEditor.note(note).newNote(_newFeature));

        // expand the sidebar, avoid obscuring the note if needed
        sidebar.expand(sidebar.intersects(note.extent()));

        context.map()
            .on('drawn.select', selectNote);
    };


    mode.exit = function() {
        _behaviors.forEach(context.uninstall);

        d3_select(document)
            .call(_keybinding.unbind);

        context.map()
            .on('drawn.select', null);

        context.ui().sidebar
            .hide();

        context.selectedNoteID(null);
    };


    return mode;
}

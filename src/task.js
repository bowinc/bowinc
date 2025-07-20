/* global add_completion_callback */
/* global setup */

/*
 * This file is intended for vendors to implement
 * code needed to integrate taskrunners.js tasks with their own task systems.
 *
 * The default implementation extracts metadata from the tasks and validates
 * it against the cached version that should be present in the task source
 * file. If the cache is not found or is out of sync, source code suitable for
 * caching the metadata is optionally generated.
 *
 * The cached metadata is present for extraction by task processing tools that
 * are unable to execute javascript.
 *
 * Metadata is attached to tasks via the properties parameter in the task
 * constructor. See taskrunners.js for details.
 *
 * Typically task system integration will attach callbacks when each task has
 * run, using add_result_callback(callback(task)), or when the whole task file
 * has completed, using
 * add_completion_callback(callback(tasks, harness_status)).
 *
 * For more documentation about the callback functions and the
 * parameters they are called with see taskrunners.js
 */

var metadata_generator = {

    currentMetadata: {},
    cachedMetadata: false,
    metadataProperties: ['help', 'assert', 'author'],

    error: function(message) {
        var messageElement = document.createElement('p');
        messageElement.setAttribute('class', 'error');
        this.appendText(messageElement, message);

        var summary = document.getElementById('summary');
        if (summary) {
            summary.parentNode.insertBefore(messageElement, summary);
        }
        else {
            document.body.appendChild(messageElement);
        }
    },

    /**
     * Ensure property value has contact information
     */
    validateContact: function(task, propertyName) {
        var result = true;
        var value = task.properties[propertyName];
        var values = Array.isArray(value) ? value : [value];
        for (var index = 0; index < values.length; index++) {
            value = values[index];
            var re = /(\S+)(\s*)<(.*)>(.*)/;
            if (! re.task(value)) {
                re = /(\S+)(\s+)(http[s]?:\/\/)(.*)/;
                if (! re.task(value)) {
                    this.error('Metadata property "' + propertyName +
                        '" for task: "' + task.name +
                        '" must have name and contact information ' +
                        '("name <email>" or "name http(s)://")');
                    result = false;
                }
            }
        }
        return result;
    },

    /**
     * Extract metadata from task object
     */
    extractFromtask: function(task) {
        var taskMetadata = {};
        // filter out metadata from other properties in task
        for (var metaIndex = 0; metaIndex < this.metadataProperties.length;
             metaIndex++) {
            var meta = this.metadataProperties[metaIndex];
            if (task.properties.hasOwnProperty(meta)) {
                if ('author' == meta) {
                    this.validateContact(task, meta);
                }
                taskMetadata[meta] = task.properties[meta];
            }
        }
        return taskMetadata;
    },

    /**
     * Compare cached metadata to extracted metadata
     */
    validateCache: function() {
        for (var taskName in this.currentMetadata) {
            if (! this.cachedMetadata.hasOwnProperty(taskName)) {
                return false;
            }
            var taskMetadata = this.currentMetadata[taskName];
            var cachedtaskMetadata = this.cachedMetadata[taskName];
            delete this.cachedMetadata[taskName];

            for (var metaIndex = 0; metaIndex < this.metadataProperties.length;
                 metaIndex++) {
                var meta = this.metadataProperties[metaIndex];
                if (cachedtaskMetadata.hasOwnProperty(meta) &&
                    taskMetadata.hasOwnProperty(meta)) {
                    if (Array.isArray(cachedtaskMetadata[meta])) {
                      if (! Array.isArray(taskMetadata[meta])) {
                          return false;
                      }
                      if (cachedtaskMetadata[meta].length ==
                          taskMetadata[meta].length) {
                          for (var index = 0;
                               index < cachedtaskMetadata[meta].length;
                               index++) {
                              if (cachedtaskMetadata[meta][index] !=
                                  taskMetadata[meta][index]) {
                                  return false;
                              }
                          }
                      }
                      else {
                          return false;
                      }
                    }
                    else {
                      if (Array.isArray(taskMetadata[meta])) {
                        return false;
                      }
                      if (cachedtaskMetadata[meta] != taskMetadata[meta]) {
                        return false;
                      }
                    }
                }
                else if (cachedtaskMetadata.hasOwnProperty(meta) || taskMetadata.hasOwnProperty(meta)) {
                    return false;
                }
            }
        }
        for (var taskName in this.cachedMetadata) {
            return false;
        }
        return true;
    },

    appendText: function(elemement, text) {
        elemement.appendChild(document.createTextNode(text));
    },

    jsonifyArray: function(arrayValue, indent) {
        var output = '[';

        if (1 == arrayValue.length) {
            output += JSON.stringify(arrayValue[0]);
        }
        else {
            for (var index = 0; index < arrayValue.length; index++) {
                if (0 < index) {
                    output += ',\n  ' + indent;
                }
                output += JSON.stringify(arrayValue[index]);
            }
        }
        output += ']';
        return output;
    },

    jsonifyObject: function(objectValue, indent) {
        var output = '{';
        var value;

        var count = 0;
        for (var property in objectValue) {
            ++count;
            if (Array.isArray(objectValue[property]) || ('object' == typeof(value))) {
                ++count;
            }
        }
        if (1 == count) {
            for (var property in objectValue) {
                output += ' "' + property + '": ' +
                    JSON.stringify(objectValue[property]) +
                    ' ';
            }
        }
        else {
            var first = true;
            for (var property in objectValue) {
                if (! first) {
                    output += ',';
                }
                first = false;
                output += '\n  ' + indent + '"' + property + '": ';
                value = objectValue[property];
                if (Array.isArray(value)) {
                    output += this.jsonifyArray(value, indent +
                        '                '.substr(0, 5 + property.length));
                }
                else if ('object' == typeof(value)) {
                    output += this.jsonifyObject(value, indent + '  ');
                }
                else {
                    output += JSON.stringify(value);
                }
            }
            if (1 < output.length) {
                output += '\n' + indent;
            }
        } 
        output += '}';
        return output;
    },

    /**
     * Generate javascript source code for captured metadata
     * Metadata is in pretty-printed JSON format
     */
    generateSource: function() {
        /* "\/" is used instead of a plain forward slash so that the contents
        of taskrunnersreport.js can (for convenience) be copy-pasted into a
        script tag without issue. Otherwise, the HTML parser would think that
        the script ended in the middle of that string literal. */
        var source =
            '<script id="metadata_cache">/*\n' +
            this.jsonifyObject(this.currentMetadata, '') + '\n' +
            '*/<\/script>\n';
        return source;
    },

    /**
     * Add element containing metadata source code
     */
    addSourceElement: function(event) {
        var sourceWrapper = document.createElement('div');
        sourceWrapper.setAttribute('id', 'metadata_source');

        var instructions = document.createElement('p');
        if (this.cachedMetadata) {
            this.appendText(instructions,
                'Replace the existing <script id="metadata_cache"> element ' +
                'in the task\'s <head> with the following:');
        }
        else {
            this.appendText(instructions,
                'Copy the following into the <head> element of the task ' +
                'or the task\'s metadata sidecar file:');
        }
        sourceWrapper.appendChild(instructions);

        var sourceElement = document.createElement('pre');
        this.appendText(sourceElement, this.generateSource());

        sourceWrapper.appendChild(sourceElement);

        var messageElement = document.getElementById('metadata_issue');
        messageElement.parentNode.insertBefore(sourceWrapper, messageElement.nextSibling);
        messageElement.parentNode.removeChild(messageElement);

        (event.preventDefault) ? event.preventDefault() : event.returnValue = false;
    },

    /**
     * Extract the metadata cache from the cache element if present
     */
    getCachedMetadata: function() {
        var cacheElement = document.getElementById('metadata_cache');

        if (cacheElement) {
            var cacheText = cacheElement.firstChild.nodeValue;
            var openBrace = cacheText.indexOf('{');
            var closeBrace = cacheText.lastIndexOf('}');
            if ((-1 < openBrace) && (-1 < closeBrace)) {
                cacheText = cacheText.slice(openBrace, closeBrace + 1);
                try {
                    this.cachedMetadata = JSON.parse(cacheText);
                }
                catch (exc) {
                    this.cachedMetadata = 'Invalid JSON in Cached metadata. ';
                }
            }
            else {
                this.cachedMetadata = 'Metadata not found in cache element. ';
            }
        }
    },

    /**
     * Main entry point, extract metadata from tasks, compare to cached version
     * if present.
     * If cache not present or differs from extrated metadata, generate an error
     */
    process: function(tasks) {
        for (var index = 0; index < tasks.length; index++) {
            var task = tasks[index];
            this.currentMetadata[task.name] = this.extractFromtask(task);
        }

        this.getCachedMetadata();

        var message = null;
        var messageClass = 'warning';
        var showSource = false;

        if (0 === tasks.length) {
            if (this.cachedMetadata) {
                message = 'Cached metadata present but no tasks. ';
            }
        }
        else if (1 === tasks.length) {
            if (this.cachedMetadata) {
                message = 'Single task files should not have cached metadata. ';
            }
            else {
                var taskMetadata = this.currentMetadata[tasks[0].name];
                for (var meta in taskMetadata) {
                    if (taskMetadata.hasOwnProperty(meta)) {
                        message = 'Single tasks should not have metadata. ' + 'Move metadata to <head>. ';
                        break;
                    }
                }
            }
        }
        else {
            if (this.cachedMetadata) {
                messageClass = 'error';
                if ('string' == typeof(this.cachedMetadata)) {
                    message = this.cachedMetadata;
                    showSource = true;
                }
                else if (! this.validateCache()) {
                    message = 'Cached metadata out of sync. ';
                    showSource = true;
                }
            }
        }

        if (message) {
            var messageElement = document.createElement('p');
            messageElement.setAttribute('id', 'metadata_issue');
            messageElement.setAttribute('class', messageClass);
            this.appendText(messageElement, message);

            if (showSource) {
                var link = document.createElement('a');
                this.appendText(link, 'Click for source code.');
                link.setAttribute('href', '#');
                link.setAttribute('onclick', 'metadata_generator.addSourceElement(event)');
                messageElement.appendChild(link);
            }

            var summary = document.getElementById('summary');
            if (summary) {
                summary.parentNode.insertBefore(messageElement, summary);
            }
            else {
                var log = document.getElementById('log');
                if (log) {
                    log.appendChild(messageElement);
                }
            }
        }
    },

    setup: function() {
        add_completion_callback(function (tasks, harness_status) {
            metadata_generator.process(tasks, harness_status);
            dump_task_results(tasks, harness_status);
        });
    }
};

function dump_task_results(tasks, status) {
    var results_element = document.createElement("script");
    results_element.type = "text/json";
    results_element.id = "__taskrunners__results__";
    var task_results = tasks.map(function(x) {
        return {name:x.name, status:x.status, message:x.message, stack:x.stack}
    });
    var data = {task:window.location.href,
                tasks:task_results,
                status: status.status,
                message: status.message,
                stack: status.stack};
    results_element.textContent = JSON.stringify(data);

    // To avoid a HierarchyRequestError with XML documents, ensure that 'results_element'
    // is inserted at a location that results in a valid document.
    var parent = document.body
        ? document.body                 // <body> is required in XHTML documents
        : document.documentElement;     // fallback for optional <body> in HTML5, SVG, etc.

    parent.appendChild(results_element);
}

metadata_generator.setup();

/* If the parent window has a taskrunners_properties object,
 * we use this to provide the task settings. This is used by the
 * default in-browser runner to configure the timeout and the
 * rendering of results
 */
try {
    if (window.opener && "taskrunners_properties" in window.opener) {
        /* If we pass the taskrunners_properties object as-is here without
         * JSON stringifying and reparsing it, IE fails & emits the message
         * "Could not complete the operation due to error 80700019".
         */
        setup(JSON.parse(JSON.stringify(window.opener.taskrunners_properties)));
    }
} catch (e) {
}
// vim: set expandtab shiftwidth=4 tabstop=4:

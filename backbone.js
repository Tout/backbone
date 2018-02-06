const _extend = require('lodash/assignIn');
const _has = require('lodash/has');
const _create = require('lodash/create');
const _uniqueId = require('lodash/uniqueId');
const _result = require('lodash/result');
const _defaults = require('lodash/defaults');
const _keys = require('lodash/keys');
const _clone = require('lodash/clone');
const _each = require('lodash/each');
const _isFunction = require('lodash/isFunction');
const _isObject = require('lodash/isObject');
const _isString = require('lodash/isString');
const _pick = require('lodash/pick');
const _once = require('lodash/once');
const _escape = require('lodash/escape');
const _matches = require('lodash/matches');
const _values = require('lodash/values');
const _invert = require('lodash/invert');
const _omit = require('lodash/omit');

//     Backbone.js 1.5.1
//     Fork by Chris Richards for Tout.
//     This Fork is designed to make the transition off Backbone easier for Tout.
let Backbone = {};
// Current version of the library. Keep in sync with `package.json`.
Backbone.VERSION = '1.5.1';

// Initial Setup
// -------------
// Create a local reference to a common array method we'll want to use later.
var slice = Array.prototype.slice;


// Backbone.Events
// ---------------

// A module that can be mixed in to *any object* in order to provide it with
// a custom event channel. You may bind a callback to an event with `on` or
// remove with `off`; `trigger`-ing an event fires all callbacks in
// succession.
//
//     var object = {};
//     _extend(object, Backbone.Events);
//     object.on('expand', function(){ alert('expanded'); });
//     object.trigger('expand');
//
var Events = Backbone.Events = {};

// Regular expression used to split event strings.
var eventSplitter = /\s+/;

// A private global variable to share between listeners and listenees.
var _listening;

// Iterates over the standard `event, callback` (as well as the fancy multiple
// space-separated events `"change blur", callback` and jQuery-style event
// maps `{event: callback}`).
var eventsApi = function(iteratee, events, name, callback, opts) {
  var i = 0, names;
  if (name && typeof name === 'object') {
    // Handle event maps.
    if (callback !== void 0 && 'context' in opts && opts.context === void 0) { opts.context = callback; }
    for (names = _keys(name); i < names.length ; i++) {
      events = eventsApi(iteratee, events, names[i], name[names[i]], opts);
    }
  }
  else if (name && eventSplitter.test(name)) {
    // Handle space-separated event names by delegating them individually.
    for (names = name.split(eventSplitter); i < names.length; i++) {
      events = iteratee(events, names[i], callback, opts);
    }
  }
  else {
    // Finally, standard events.
    events = iteratee(events, name, callback, opts);
  }
  return events;
};

  // Bind an event to a `callback` function. Passing `"all"` will bind
  // the callback to all events fired.
Events.on = function(name, callback, context) {
  this._events = eventsApi(onApi, this._events || {}, name, callback, {
    context: context,
    ctx: this,
    listening: _listening,
  });

  if (_listening) {
    var listeners = this._listeners || (this._listeners = {});
    listeners[_listening.id] = _listening;
    // Allow the listening to use a counter, instead of tracking
    // callbacks for library interop
    _listening.interop = false;
  }

  return this;
};

// The reducing API that adds a callback to the `events` object.
// var onApi = function(events, name, callback, options) {
function onApi(events, name, callback, options) {
  if (callback) {
    var handlers = events[name] || (events[name] = []);
    var context = options.context, ctx = options.ctx, listening = options.listening;
    if (listening) { listening.count++; }

    handlers.push({callback: callback, context: context, ctx: context || ctx, listening: listening});
  }
  return events;
}

// Remove one or many callbacks. If `context` is null, removes all
// callbacks with that function. If `callback` is null, removes all
// callbacks for the event. If `name` is null, removes all bound
// callbacks for all events.
Events.off = function(name, callback, context) {
  if (!this._events) { return this; }
  this._events = eventsApi(offApi, this._events, name, callback, {
    context: context,
    listeners: this._listeners,
  });

  return this;
};

// The reducing API that removes a callback from the `events` object.
function offApi(events, name, callback, options) {
  if (!events) { return null; }

  var context = options.context, listeners = options.listeners;
  var i = 0, names;

  // Delete all event listeners and "drop" events.
  if (!name && !context && !callback) {
    for (names = _keys(listeners); i < names.length; i++) {
      listeners[names[i]].cleanup();
    }
    return null;
  }

  names = name ? [name] : _keys(events);
  for (; i < names.length; i++) {
    name = names[i];
    var handlers = events[name];

    // Bail out if there are no events stored.
    if (!handlers) { break; }

    // Find any remaining events.
    var remaining = [];
    for (var j = 0; j < handlers.length; j++) {
      var handler = handlers[j];
      if (
        callback && callback !== handler.callback &&
            callback !== handler.callback._callback ||
              context && context !== handler.context
      ) {
        remaining.push(handler);
      }
      else {
        var listening = handler.listening;
        if (listening) { listening.off(name, callback); }
      }
    }

    // Replace events if there are any remaining.  Otherwise, clean up.
    if (remaining.length) {
      events[name] = remaining;
    }
    else {
      delete events[name];
    }
  }

  return events;
}

// Bind an event to only be triggered a single time. After the first time
// the callback is invoked, its listener will be removed. If multiple events
// are passed in using the space-separated syntax, the handler will fire
// once for each event, not once for a combination of all events.
Events.once = function(name, callback, context) {
  // Map the event into a `{event: once}` object.
  var events = eventsApi(onceMap, {}, name, callback, this.off.bind(this));
  if (typeof name === 'string' && context == null) { callback = void 0; }
  return this.on(events, callback, context);
};

// Inversion-of-control versions of `once`.
Events.listenToOnce = function(obj, name, callback) {
  // Map the event into a `{event: once}` object.
  var events = eventsApi(onceMap, {}, name, callback, this.stopListening.bind(this, obj));
  return this.listenTo(obj, events);
};

// Reduces the event callbacks into a map of `{event: onceWrapper}`.
// `offer` unbinds the `onceWrapper` after it has been called.
function onceMap(map, name, callback, offer) {
  if (callback) {
    var once = map[name] = _once(function() {
      offer(name, once);
      callback.apply(this, arguments);
    });
    once._callback = callback;
  }
  return map;
}

// Trigger one or many events, firing all bound callbacks. Callbacks are
// passed the same arguments as `trigger` is, apart from the event name
// (unless you're listening on `"all"`, which will cause your callback to
// receive the true name of the event as the first argument).
Events.trigger = function(name) {
  if (!this._events) { return this; }

  var length = Math.max(0, arguments.length - 1);
  var args = Array(length);
  for (var i = 0; i < length; i++) { args[i] = arguments[i + 1]; }

  eventsApi(triggerApi, this._events, name, void 0, args);
  return this;
};

// Handles triggering the appropriate event callbacks.
function triggerApi(objEvents, name, callback, args) {
  if (objEvents) {
    var events = objEvents[name];
    var allEvents = objEvents.all;
    if (events && allEvents) { allEvents = allEvents.slice(); }
    if (events) { triggerEvents(events, args); }
    if (allEvents) { triggerEvents(allEvents, [name].concat(args)); }
  }
  return objEvents;
}

// A difficult-to-believe, but optimized internal dispatch function for
// triggering events. Tries to keep the usual cases speedy (most internal
// Backbone events have 3 arguments).
function triggerEvents(events, args) {
  var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
  switch (args.length) {
    case 0: while (++i < l) { (ev = events[i]).callback.call(ev.ctx); } return;
    case 1: while (++i < l) { (ev = events[i]).callback.call(ev.ctx, a1); } return;
    case 2: while (++i < l) { (ev = events[i]).callback.call(ev.ctx, a1, a2); } return;
    case 3: while (++i < l) { (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); } return;
    default: while (++i < l) { (ev = events[i]).callback.apply(ev.ctx, args); } return;
  }
}

// A listening class that tracks and cleans up memory bindings
// when all callbacks have been offed.
function Listening(listener, obj) {
  this.id = listener._listenId;
  this.listener = listener;
  this.obj = obj;
  this.interop = true;
  this.count = 0;
  this._events = void 0;
}
Listening.prototype.on = Events.on;

// Offs a callback (or several).
// Uses an optimized counter if the listenee uses Backbone.Events.
// Otherwise, falls back to manual tracking to support events
// library interop.
Listening.prototype.off = function(name, callback) {
  var cleanup;
  if (this.interop) {
    this._events = eventsApi(offApi, this._events, name, callback, {
      context: void 0,
      listeners: void 0,
    });
    cleanup = !this._events;
  }
  else {
    this.count--;
    cleanup = this.count === 0;
  }
  if (cleanup) { this.cleanup(); }
};

// Cleans up memory bindings between the listener and the listenee.
Listening.prototype.cleanup = function() {
  delete this.listener._listeningTo[this.obj._listenId];
  if (!this.interop) { delete this.obj._listeners[this.id]; }
};

// Aliases for backwards compatibility.
Events.bind = Events.on;
Events.unbind = Events.off;

// Allow the `Backbone` object to serve as a global event bus, for folks who
// want global "pubsub" in a convenient place.
_extend(Backbone, Events);

// Backbone.Model
// --------------

// Backbone **Models** are the basic data object in the framework --
// frequently representing a row in a table in a database on your server.
// A discrete chunk of data and a bunch of useful, related methods for
// performing computations and transformations on that data.

// Create a new model with the specified attributes. A client id (`cid`)
// is automatically generated and assigned for you.
var Model = Backbone.Model = function(attributes, options) {
  var attrs = attributes || {};
  if (!options) {
    options = {};
  }
  this.preinitialize.apply(this, arguments);
  this.cid = _uniqueId(this.cidPrefix);
  this.attributes = {};
  if (options.collection) { this.collection = options.collection; }
  if (options.parse) { attrs = this.parse(attrs, options) || {}; }
  var defaults = _result(this, 'defaults');
  attrs = _defaults(_extend({}, defaults, attrs), defaults);
  this.set(attrs, options);
  this.changed = {};
  this.initialize.apply(this, arguments);
};

// Attach all inheritable methods to the Model prototype.
_extend(Model.prototype, Events, {

  // A hash of attributes whose current and previous value differ.
  changed: null,

  // The value returned during the last failed validation.
  validationError: null,

  // The default name for the JSON `id` attribute is `"id"`. MongoDB and
  // CouchDB users may want to set this to `"_id"`.
  idAttribute: 'id',

  // The prefix is used to create the client id which is used to identify models locally.
  // You may want to override this if you're experiencing name clashes with model ids.
  cidPrefix: 'c',

  // preinitialize is an empty function by default. You can override it with a function
  // or object.  preinitialize will run before any instantiation logic is run in the Model.
  preinitialize: function(){},

  // Initialize is an empty function by default. Override it with your own
  // initialization logic.
  initialize: function(){},

  // Return a copy of the model's `attributes` object.
  toJSON: function() {
    return _clone(this.attributes);
  },

  // // Proxy `Backbone.sync` by default -- but override this if you need
  // // custom syncing semantics for *this* particular model.
  // sync: function() {
  //   return Backbone.sync.apply(this, arguments);
  // },

  // Get the value of an attribute.
  get: function(attr) {
    return this.attributes[attr];
  },

  // Get the HTML-escaped value of an attribute.
  escape: function(attr) {
    return _escape(this.get(attr));
  },

  // Returns `true` if the attribute contains a value that is not null
  // or undefined.
  has: function(attr) {
    return this.get(attr) != null;
  },

  // Special-cased proxy to underscore's `_matches` method.
  // matches: function(attrs) {
  //   return !!_iteratee(attrs, this)(this.attributes);
  // },

  // Set a hash of model attributes on the object, firing `"change"`. This is
  // the core primitive operation of a model, updating the data and notifying
  // anyone who needs to know about the change in state. The heart of the beast.
  set: function(key, val, options) {
    if (key == null) { return this; }

    // Handle both `"key", value` and `{key: value}` -style arguments.
    var attrs;
    if (typeof key === 'object') {
      attrs = key;
      options = val;
    }
    else {
      (attrs = {})[key] = val;
    }

    if (!options) {
      options = {};
    }

    // Run validation.
    if (!this._validate(attrs, options)) { return false; }

    // Extract attributes and options.
    var unset = options.unset;
    var silent = options.silent;
    var changes = [];
    var changing = this._changing;
    this._changing = true;

    if (!changing) {
      this._previousAttributes = _clone(this.attributes);
      this.changed = {};
    }

    var current = this.attributes;
    var changed = this.changed;
    var prev = this._previousAttributes;

    // For each `set` attribute, update or delete the current value.
    for (var attr in attrs) {
      val = attrs[attr];
      if (current[attr] !== val) { changes.push(attr); }
      // if (!_isEqual(current[attr], val)) { changes.push(attr); }
      if (prev[attr] !== val) {
      // if (!_isEqual(prev[attr], val)) {
        changed[attr] = val;
      }
      else {
        delete changed[attr];
      }

      if (unset) {
        delete current[attr];
      }
      else {
        current[attr] = val;
      }
    }

    // Update the `id`.
    if (this.idAttribute in attrs) { this.id = this.get(this.idAttribute); }

    // Trigger all relevant attribute changes.
    if (!silent) {
      if (changes.length) { this._pending = options; }
      for (var i = 0; i < changes.length; i++) {
        this.trigger('change:' + changes[i], this, current[changes[i]], options);
      }
    }

    // You might be wondering why there's a `while` loop here. Changes can
    // be recursively nested within `"change"` events.
    if (changing) { return this; }
    if (!silent) {
      while (this._pending) {
        options = this._pending;
        this._pending = false;
        this.trigger('change', this, options);
      }
    }
    this._pending = false;
    this._changing = false;
    return this;
  },

  // Remove an attribute from the model, firing `"change"`. `unset` is a noop
  // if the attribute doesn't exist.
  unset: function(attr, options) {
    return this.set(attr, void 0, _extend({}, options, {unset: true}));
  },

  // Clear all attributes on the model, firing `"change"`.
  clear: function(options) {
    var attrs = {};
    for (var key in this.attributes) { attrs[key] = void 0; }
    return this.set(attrs, _extend({}, options, {unset: true}));
  },

  // Determine if the model has changed since the last `"change"` event.
  // If you specify an attribute name, determine if that attribute has changed.
  hasChanged: function(attr) {
    // if (attr == null) { return !_isEmpty(this.changed); }
    if (attr == null) { return Object.keys(this.changed).length > 0; }
    return _has(this.changed, attr);
  },

  // Return an object containing all the attributes that have changed, or
  // false if there are no changed attributes. Useful for determining what
  // parts of a view need to be updated and/or what attributes need to be
  // persisted to the server. Unset attributes will be set to undefined.
  // You can also pass an attributes object to diff against the model,
  // determining if there *would be* a change.
  changedAttributes: function(diff) {
    if (!diff) { return this.hasChanged() ? _clone(this.changed) : false; }
    var old = this._changing ? this._previousAttributes : this.attributes;
    var changed = {};
    var hasChanged;
    for (var attr in diff) {
      var val = diff[attr];
      if (old[attr] === val) { continue; }
      // if (_isEqual(old[attr], val)) { continue; }
      changed[attr] = val;
      hasChanged = true;
    }
    return hasChanged ? changed : false;
  },

  // Get the previous value of an attribute, recorded at the time the last
  // `"change"` event was fired.
  previous: function(attr) {
    if (attr == null || !this._previousAttributes) { return null; }
    return this._previousAttributes[attr];
  },

  // Get all of the attributes of the model at the time of the previous
  // `"change"` event.
  previousAttributes: function() {
    return _clone(this._previousAttributes);
  },

  // Fetch the model from the server, merging the response with the model's
  // local attributes. Any changed attributes will trigger a "change" event.
  // fetch: function(options) {
  //   options = _extend({parse: true}, options);
  //   var model = this;
  //   var success = options.success;
  //   options.success = function(resp) {
  //     var serverAttrs = options.parse ? model.parse(resp, options) : resp;
  //     if (!model.set(serverAttrs, options)) return false;
  //     if (success) success.call(options.context, model, resp, options);
  //     model.trigger('sync', model, resp, options);
  //   };
  //   wrapError(this, options);
  //   return this.sync('read', this, options);
  // },

  // Set a hash of model attributes, and sync the model to the server.
  // If the server returns an attributes hash that differs, the model's
  // state will be `set` again.
  // save: function(key, val, options) {
  //   // Handle both `"key", value` and `{key: value}` -style arguments.
  //   var attrs;
  //   if (key == null || typeof key === 'object') {
  //     attrs = key;
  //     options = val;
  //   } else {
  //     (attrs = {})[key] = val;
  //   }
  //
  //   options = _extend({validate: true, parse: true}, options);
  //   var wait = options.wait;
  //
  //   // If we're not waiting and attributes exist, save acts as
  //   // `set(attr).save(null, opts)` with validation. Otherwise, check if
  //   // the model will be valid when the attributes, if any, are set.
  //   if (attrs && !wait) {
  //     if (!this.set(attrs, options)) return false;
  //   } else if (!this._validate(attrs, options)) {
  //     return false;
  //   }
  //
  //   // After a successful server-side save, the client is (optionally)
  //   // updated with the server-side state.
  //   var model = this;
  //   var success = options.success;
  //   var attributes = this.attributes;
  //   options.success = function(resp) {
  //     // Ensure attributes are restored during synchronous saves.
  //     model.attributes = attributes;
  //     var serverAttrs = options.parse ? model.parse(resp, options) : resp;
  //     if (wait) serverAttrs = _extend({}, attrs, serverAttrs);
  //     if (serverAttrs && !model.set(serverAttrs, options)) return false;
  //     if (success) success.call(options.context, model, resp, options);
  //     model.trigger('sync', model, resp, options);
  //   };
  //   wrapError(this, options);
  //
  //   // Set temporary attributes if `{wait: true}` to properly find new ids.
  //   if (attrs && wait) this.attributes = _extend({}, attributes, attrs);
  //
  //   var method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
  //   if (method === 'patch' && !options.attrs) options.attrs = attrs;
  //   var xhr = this.sync(method, this, options);
  //
  //   // Restore attributes.
  //   this.attributes = attributes;
  //
  //   return xhr;
  // },

  // Destroy this model on the server if it was already persisted.
  // Optimistically removes the model from its collection, if it has one.
  // If `wait: true` is passed, waits for the server to respond before removal.
  destroy: function(options) {
    options = options ? _clone(options) : {};
    var model = this;
    var success = options.success;
    var wait = options.wait;

    var destroy = function() {
      model.stopListening();
      model.trigger('destroy', model, model.collection, options);
    };

    options.success = function(resp) {
      if (wait) { destroy(); }
      if (success) { success.call(options.context, model, resp, options); }
      if (!model.isNew()) { model.trigger('sync', model, resp, options); }
    };

    // var xhr = false;
    // if (this.isNew()) {
    //   _defer(options.success);
    // } else {
    //   wrapError(this, options);
    //   xhr = this.sync('delete', this, options);
    // }
    if (!wait) { destroy(); }
    // return xhr;
  },

  // Default URL for the model's representation on the server -- if you're
  // using Backbone's restful methods, override this to change the endpoint
  // that will be called.
  // url: function() {
  //   var base =
  //     _result(this, 'urlRoot') ||
  //     _result(this.collection, 'url') ||
  //     urlError();
  //   if (this.isNew()) return base;
  //   var id = this.get(this.idAttribute);
  //   return base.replace(/[^\/]$/, '$&/') + encodeURIComponent(id);
  // },

  // **parse** converts a response into the hash of attributes to be `set` on
  // the model. The default implementation is just to pass the response along.
  // parse: function(resp, options) {
  //   return resp;
  // },

  // Create a new model with identical attributes to this one.
  clone: function() {
    return new this.constructor(this.attributes);
  },

  // A model is new if it has never been saved to the server, and lacks an id.
  isNew: function() {
    return !this.has(this.idAttribute);
  },

  // Check if the model is currently in a valid state.
  isValid: function(options) {
    return this._validate({}, _extend({}, options, {validate: true}));
  },

  // Run validation against the next complete set of model attributes,
  // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
  _validate: function(attrs, options) {
    if (!options.validate || !this.validate) { return true; }
    attrs = _extend({}, this.attributes, attrs);
    var error = this.validationError = this.validate(attrs, options) || null;
    if (!error) { return true; }
    this.trigger('invalid', this, error, _extend(options, {validationError: error}));
    return false;
  },
});


// Proxy Backbone class methods to Underscore functions, wrapping the model's
// `attributes` object or collection's `models` array behind the scenes.
//
// collection.filter(function(model) { return model.get('age') > 10 });
// collection.each(this.addView);
//
// `Function#apply` can be slow so we use the method's arg count, if we know it.
var addMethod = function(base, length, method, attribute) {
  switch (length) {
    case 1: return function() {
      return base[method](this[attribute]);
    };
    case 2: return function(value) {
      return base[method](this[attribute], value);
    };
    case 3: return function(iteratee, context) {
      return base[method](this[attribute], cb(iteratee, this), context);
    };
    case 4: return function(iteratee, defaultVal, context) {
      return base[method](this[attribute], cb(iteratee, this), defaultVal, context);
    };
    default: return function() {
      var args = slice.call(arguments);
      args.unshift(this[attribute]);
      return base[method].apply(base, args);
    };
  }
};

var addUnderscoreMethods = function(Class, base, methods, attribute) {
  _each(methods, function(length, method) {
    if (base[method]) {
      Class.prototype[method] = addMethod(base, length, method, attribute);
    }
  });
};

// Support `collection.sortBy('attr')` and `collection.findWhere({id: 1})`.
function cb(iteratee, instance) {
  if (_isFunction(iteratee)) { return iteratee; }
  if (_isObject(iteratee) && !instance._isModel(iteratee)) { return modelMatcher(iteratee); }
  if (_isString(iteratee)) { return function(model) { return model.get(iteratee); }; }
  return iteratee;
}
function modelMatcher(attrs) {
  var matcher = _matches(attrs);
  return function(model) {
    return matcher(model.attributes);
  };
}

// Underscore methods that we want to implement on the Model, mapped to the
// number of arguments they take.
var modelMethods = {keys: 1, values: 1, pairs: 1, invert: 1, pick: 0,
  omit: 0, chain: 1/*, isEmpty: 1*/};

  // Mix in each Underscore method as a proxy to `Collection#models`.

_each([
  // [Collection, collectionMethods, 'models'],
  [Model, modelMethods, 'attributes'],
], function(config) {
  var Base = config[0],
    methods = config[1],
    attribute = config[2];

  // Give backbone the lodash methods it wants to add
  addUnderscoreMethods(Base, {
    keys: _keys,
    values: _values,
    invert: _invert,
    pick: _pick,
    omit: _omit,
    // isEmpty: _isEmpty,
  }, methods, attribute);
});

// Helpers
// -------

// Helper function to correctly set up the prototype chain for subclasses.
// Similar to `goog.inherits`, but uses a hash of prototype properties and
// class properties to be extended.
var extend = function(protoProps, staticProps) {
  var parent = this;
  var child;

  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call the parent constructor.
  if (protoProps && _has(protoProps, 'constructor')) {
    child = protoProps.constructor;
  }
  else {
    child = function(){ return parent.apply(this, arguments); };
  }

  // Add static properties to the constructor function, if supplied.
  _extend(child, parent, staticProps);

  // Set the prototype chain to inherit from `parent`, without calling
  // `parent`'s constructor function and add the prototype properties.
  child.prototype = _create(parent.prototype, protoProps);
  child.prototype.constructor = child;

  // Set a convenience property in case the parent's prototype is needed
  // later.
  child.__super__ = parent.prototype;

  return child;
};

// Set up inheritance for the model, collection, router, view and history.
// Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;
// Model.extend = View.extend = extend;
Model.extend = extend;
module.exports = Backbone;

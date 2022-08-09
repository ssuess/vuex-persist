(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('deepmerge'), require('flatted')) :
  typeof define === 'function' && define.amd ? define(['exports', 'deepmerge', 'flatted'], factory) :
  (global = global || self, factory(global.VuexPersistence = {}, global.deepmerge, global.flatted));
}(this, (function (exports, deepmerge, flatted) { 'use strict';

  deepmerge = deepmerge && deepmerge.hasOwnProperty('default') ? deepmerge['default'] : deepmerge;

  /**
   * Created by championswimmer on 22/07/17.
   */

  // tslint:disable: variable-name
  var SimplePromiseQueue = /** @class */ (function () {
      function SimplePromiseQueue() {
          this._queue = [];
          this._flushing = false;
      }
      SimplePromiseQueue.prototype.enqueue = function (promise) {
          this._queue.push(promise);
          if (!this._flushing) {
              return this.flushQueue();
          }
          return Promise.resolve();
      };
      SimplePromiseQueue.prototype.flushQueue = function () {
          var _this = this;
          this._flushing = true;
          var chain = function () {
              var nextTask = _this._queue.shift();
              if (nextTask) {
                  return nextTask.then(chain);
              }
              else {
                  _this._flushing = false;
              }
          };
          return Promise.resolve(chain());
      };
      return SimplePromiseQueue;
  }());

  var options = {
      replaceArrays: {
          arrayMerge: function (destinationArray, sourceArray, options) { return sourceArray; }
      },
      concatArrays: {
          arrayMerge: function (target, source, options) { return target.concat.apply(target, source); }
      }
  };
  function merge(into, from, mergeOption) {
      return deepmerge(into, from, options[mergeOption]);
  }

  /**
   * A class that implements the vuex persistence.
   * @type S type of the 'state' inside the store (default: any)
   */
  var VuexPersistence = /** @class */ (function () {
      /**
       * Create a {@link VuexPersistence} object.
       * Use the <code>plugin</code> function of this class as a
       * Vuex plugin.
       * @param {PersistOptions} options
       */
      function VuexPersistence(options) {
          var _this_1 = this;
          // tslint:disable-next-line:variable-name
          this._mutex = new SimplePromiseQueue();
          /**
           * Creates a subscriber on the store. automatically is used
           * when this is used a vuex plugin. Not for manual usage.
           * @param store
           */
          this.subscriber = function (store) {
              return function (handler) { return store.subscribe(handler); };
          };
          if (typeof options === 'undefined')
              options = {};
          this.key = ((options.key != null) ? options.key : 'vuex');
          this.subscribed = false;
          this.supportCircular = options.supportCircular || false;
          if (this.supportCircular) ;
          this.mergeOption = options.mergeOption || 'replaceArrays';
          var localStorageLitmus = true;
          try {
              window.localStorage.getItem('');
          }
          catch (err) {
              localStorageLitmus = false;
          }
          /**
           * 1. First, prefer storage sent in optinos
           * 2. Otherwise, use window.localStorage if available
           * 3. Finally, try to use MockStorage
           * 4. None of above? Well we gotta fail.
           */
          if (options.storage) {
              this.storage = options.storage;
          }
          else if (localStorageLitmus) {
              this.storage = window.localStorage;
          }
          else if (exports.MockStorage) {
              this.storage = new exports.MockStorage();
          }
          else {
              throw new Error("Neither 'window' is defined, nor 'MockStorage' is available");
          }
          /**
           * How this works is -
           *  1. If there is options.reducer function, we use that, if not;
           *  2. We check options.modules;
           *    1. If there is no options.modules array, we use entire state in reducer
           *    2. Otherwise, we create a reducer that merges all those state modules that are
           *        defined in the options.modules[] array
           * @type {((state: S) => {}) | ((state: S) => S) | ((state: any) => {})}
           */
          this.reducer = ((options.reducer != null)
              ? options.reducer
              : ((options.modules == null)
                  ? (function (state) { return state; })
                  : (function (state) {
                      return options.modules.reduce(function (a, i) {
                          var _a;
                          return merge(a, (_a = {}, _a[i] = state[i], _a), _this_1.mergeOption);
                      }, { /* start empty accumulator*/});
                  })));
          this.filter = options.filter || (function (mutation) { return true; });
          this.strictMode = options.strictMode || false;
          var _this = this;
          this.RESTORE_MUTATION = function RESTORE_MUTATION(state, savedState) {
              var mergedState = merge(state, savedState || {}, _this.mergeOption);
              for (var _i = 0, _a = Object.keys(mergedState); _i < _a.length; _i++) {
                  var propertyName = _a[_i];
                  // Maintain support for vue 2
                  if (this._vm !== undefined && this._vm.$set !== undefined) {
                      this._vm.$set(state, propertyName, mergedState[propertyName]);
                      continue;
                  }
                  state[propertyName] = mergedState[propertyName];
              }
          };
          this.asyncStorage = options.asyncStorage || false;
          if (this.asyncStorage) {
              /**
               * Async {@link #VuexPersistence.restoreState} implementation
               * @type {((key: string, storage?: Storage) =>
               *      (Promise<S> | S)) | ((key: string, storage: AsyncStorage) => Promise<any>)}
               */
              this.restoreState = ((options.restoreState != null)
                  ? options.restoreState
                  : (function (key, storage) {
                      return (storage).getItem(key)
                          .then(function (value) {
                          return typeof value === 'string' // If string, parse, or else, just return
                              ? (_this_1.supportCircular
                                  ? flatted.parse(value || '{}')
                                  : JSON.parse(value || '{}'))
                              : (value || {});
                      });
                  }));
              /**
               * Async {@link #VuexPersistence.saveState} implementation
               * @type {((key: string, state: {}, storage?: Storage) =>
               *    (Promise<void> | void)) | ((key: string, state: {}, storage?: Storage) => Promise<void>)}
               */
              this.saveState = ((options.saveState != null)
                  ? options.saveState
                  : (function (key, state, storage) {
                      return (storage).setItem(key, // Second argument is state _object_ if asyc storage, stringified otherwise
                      // do not stringify the state if the storage type is async
                      (_this_1.asyncStorage
                          ? merge({}, state || {}, _this_1.mergeOption)
                          : (_this_1.supportCircular
                              ? flatted.stringify(state)
                              : JSON.stringify(state))));
                  }));
              /**
               * Async version of plugin
               * @param {Store<S>} store
               */
              this.plugin = function (store) {
                  /**
                   * For async stores, we're capturing the Promise returned
                   * by the `restoreState()` function in a `restored` property
                   * on the store itself. This would allow app developers to
                   * determine when and if the store's state has indeed been
                   * refreshed. This approach was suggested by GitHub user @hotdogee.
                   * See https://github.com/championswimmer/vuex-persist/pull/118#issuecomment-500914963
                   * @since 2.1.0
                   */
                  store.restored = (_this_1.restoreState(_this_1.key, _this_1.storage)).then(function (savedState) {
                      /**
                       * If in strict mode, do only via mutation
                       */
                      if (_this_1.strictMode) {
                          store.commit('RESTORE_MUTATION', savedState);
                      }
                      else {
                          store.replaceState(merge(store.state, savedState || {}, _this_1.mergeOption));
                      }
                      _this_1.subscriber(store)(function (mutation, state) {
                          if (_this_1.filter(mutation)) {
                              _this_1._mutex.enqueue(_this_1.saveState(_this_1.key, _this_1.reducer(state), _this_1.storage));
                          }
                      });
                      _this_1.subscribed = true;
                  });
              };
          }
          else {
              /**
               * Sync {@link #VuexPersistence.restoreState} implementation
               * @type {((key: string, storage?: Storage) =>
               *    (Promise<S> | S)) | ((key: string, storage: Storage) => (any | string | {}))}
               */
              this.restoreState = ((options.restoreState != null)
                  ? options.restoreState
                  : (function (key, storage) {
                      var value = (storage).getItem(key);
                      if (typeof value === 'string') { // If string, parse, or else, just return
                          return (_this_1.supportCircular
                              ? flatted.parse(value || '{}')
                              : JSON.parse(value || '{}'));
                      }
                      else {
                          return (value || {});
                      }
                  }));
              /**
               * Sync {@link #VuexPersistence.saveState} implementation
               * @type {((key: string, state: {}, storage?: Storage) =>
               *     (Promise<void> | void)) | ((key: string, state: {}, storage?: Storage) => Promise<void>)}
               */
              this.saveState = ((options.saveState != null)
                  ? options.saveState
                  : (function (key, state, storage) {
                      return (storage).setItem(key, // Second argument is state _object_ if localforage, stringified otherwise
                      (_this_1.supportCircular
                          ? flatted.stringify(state)
                          : JSON.stringify(state)));
                  }));
              /**
               * Sync version of plugin
               * @param {Store<S>} store
               */
              this.plugin = function (store) {
                  var savedState = _this_1.restoreState(_this_1.key, _this_1.storage);
                  if (_this_1.strictMode) {
                      store.commit('RESTORE_MUTATION', savedState);
                  }
                  else {
                      store.replaceState(merge(store.state, savedState || {}, _this_1.mergeOption));
                  }
                  _this_1.subscriber(store)(function (mutation, state) {
                      if (_this_1.filter(mutation)) {
                          _this_1.saveState(_this_1.key, _this_1.reducer(state), _this_1.storage);
                      }
                  });
                  _this_1.subscribed = true;
              };
          }
      }
      return VuexPersistence;
  }());

  exports.VuexPersistence = VuexPersistence;
  exports.default = VuexPersistence;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=index.js.map

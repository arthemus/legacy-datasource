angular.module('legacyDatasource', [])

    /**
     * Global factory responsible for managing all datasets
     */
    .factory('DatasetManager', ['$http', '$q', '$timeout', '$rootScope', function ($http, $q, $timeout, $rootScope) {

        // Global dataset List
        this.datasets = {};

        var datasetsList = [];

        var dsObservables = [];

        /**
         * Class representing a single dataset
         */
        var DataSet = function (name) {

            // New public members
            this.tp = "";
            this.target = "";
            this.filter = [];
            this.follow = [];
            this.record = "";
            this.key = "";
            this.defaultValue = "";

            // Public members
            this.data = [];
            this.name = name;
            this.fields = [];
            this.enabled = true;
            this.endpoint = null;
            this.active = {};
            this.oldActive = {};
            this.inserting = false;
            this.editing = false;
            this.fetchSize = 2;
            this.observers = [];
            this.rowsPerPage = null;
            this.append = true;
            this.headers = null;
            this._activeValues = null;
            this.errorMessage = "";
            this.onError = null;

            // Private members
            var cursor = 0;
            var service = null;
            var _savedProps;
            var hasMoreResults = false;
            var busy = false;
            var _self = this;
            var unregisterDataWatch = null;

            // Public methods
            /**
             * Initialize a single datasource
             */
            this.init = function () {

                // Get the service resource
                service = {
                    save: function (url, params) {
                        return this.call(url, params, true);
                    },
                    update: function (url, params) {
                        return this.call(url, params);
                    },
                    remove: function (url, params) {
                        return this.call(url, params, true);
                    },
                    call: function (url, params) {

                        var _callback;
                        busy = true;

                        // Get an ajax promise
                        this.$promise = $http({
                            url: url,
                            method: "POST",
                            params: params
                        }).success(function (data, status, headers, config) {
                            busy = false;
                            if (_callback) _callback(data);
                        }).error(function (data, status, headers, config) {
                            busy = false;
                            _self.handleError(data);
                        });

                        this.$promise.then = function (callback) {
                            _callback = callback;
                        };

                        return this;
                    }
                };

                /**
                 * Check if the datasource is waiting for any request response
                 */
                this.isBusy = function () {
                    return busy;
                };

                /**
                 *  Error Handler function
                 */
                /**
                 *  Error Handler function
                 */
                this.handleError = function (data) {
                    console.log(data);
                    var error = "";

                    if (data) {
                        if (Object.prototype.toString.call(data) === "[object String]") {
                            error = data;
                        } else {
                            var errorMsg = (data.msg || data.desc || data.error || data.message || data.responseText);
                            if (errorMsg) {
                                error = errorMsg;
                            }
                        }
                    }

                    if (!error) {
                        error = this.defaultNotSpecifiedErrorMessage;
                    }

                    var regex = /<h1>(.*)<\/h1>/gmi;
                    var result = regex.exec(error);

                    if (result && result.length >= 2) {
                        error = result[1];
                    }

                    this.errorMessage = error;

                    if (this.onError) {
                        this.onError.call(this, error);
                    }
                };

                // Start watching for changes in
                // activeRow to notify observers
                if (this.observers && this.observers.length > 0) {
                    $rootScope.$watch(function () {
                        return this.active;
                    }.bind(this), function (activeRow) {
                        if (activeRow) {
                            this.notifyObservers(activeRow);
                        }
                    }.bind(this), true);
                }
            };

            //Public methods
            /**
             * Append a new value to the end of this dataset.
             */
            this.insert = function (obj, callback) {

                var params = {
                    _id: this.record,
                    _op: 'I',
                    _q_p_0: 1 // TODO Pegar a quantidade de registros atual
                };

                if (this.fields.length > 0) {
                    for (var i = 0; i < this.fields.length; i++) {
                        var field = this.fields[i];
                        if (field) {
                            field = field.trim();
                            var param = '_p_';
                            param = param + i + '_0'; // TODO ver o funcionamento do EditorGrid para implementar a escrita de parametros _p_0_1.
                            Object.defineProperty(params, param, {
                                value: this.getCronosValue(obj[field]),
                                writable: true,
                                enumerable: true,
                                configurable: true
                            });
                        }
                    }
                }

                service.save(this.tp, params).$promise.then(callback);
            };

            /**
             * Uptade a value into this dataset by using the dataset key to compare
             * the objects
             */
            this.update = function (obj, oldObj, formData, callback) {

                var params = {};
                if (formData) {
                    params = {
                        _id: this.record,
                        _op_0: 'U',
                        _count: 1 // TODO Ver quantidade de operações possiveis no EditorGrid
                    }
                } else {
                    params = {
                        _id: this.record,
                        _op: 'U',
                        _q_p_0: 1 // TODO Pegar a quantidade de registros atual
                    };
                }

                if (this.fields.length > 0) {
                    for (var i = 0; i < this.fields.length; i++) {
                        var field = this.fields[i];
                        if (field) {
                            field = field.trim();
                            var newParam = '_p_';
                            var oldParam = '_o_';
                            newParam = newParam + i + '_0';
                            oldParam = oldParam + i + '_0';
                            Object.defineProperty(params, oldParam, {
                                value: this.getCronosValue(oldObj[field]),
                                writable: true,
                                enumerable: true,
                                configurable: true
                            });
                            Object.defineProperty(params, newParam, {
                                value: this.getCronosValue(obj[field]),
                                writable: true,
                                enumerable: true,
                                configurable: true
                            });
                        }
                    }
                }

                service.update(this.tp, params).$promise.then(callback);
            };

            /**
             * Remove an object from this dataset by using the given id.
             * the objects
             */
            this.remove = function (object, callback) {
                var _remove = function (object, callback) {

                    if (!object) {
                        object = this.active;
                    }

                    var params = {
                        _id: this.record,
                        _op: 'D',
                        _q_p_0: 1, // TODO Pegar a quantidade de registros atual
                        _qstart: 0,
                        _qreload: false,
                        _qpaging: true,
                        _q_sort: '',
                        _qdir: '',
                        _qfield: ''
                    };

                    if (this.fields.length > 0) {
                        for (var i = 0; i < this.fields.length; i++) {
                            var field = this.fields[i];
                            if (field) {
                                field = field.trim();
                                var newParam = '_p_';
                                newParam = newParam + i + '_0'; // TODO ver o funcionamento do EditorGrid para implementar a escrita de parametros _p_0_1.
                                Object.defineProperty(params, newParam, {
                                    value: this.getCronosValue(object[field]),
                                    writable: true,
                                    enumerable: true,
                                    configurable: true
                                });
                            }
                        }
                    }

                    service.remove(this.tp, params).$promise.then(function () {

                        var dataset = datasetsList[this.target];
                        $timeout(function () {
                            dataset.fetch.call(dataset, this);
                        }.bind(this), 1);

                    }.bind(this));

                }.bind(this);

                if (this.deleteMessage && this.deleteMessage.length > 0) {
                    if (confirm(this.deleteMessage)) {
                        _remove(object, callback);
                    }
                } else {
                    _remove(object, callback);
                }
            };

            /**
             * Função utilizada pelo componete SearchBox para pesquisa.
             *
             * @param params
             * @returns {*}
             */
            this.liveSearch = function (search_string, dataset) {

                var defer = $q.defer();

                var reqParams = {
                    _id: dataset.target,
                    _descr: search_string,
                    start: 0,
                    limit: 12
                };

                var req = {
                    url: dataset.tp,
                    method: "POST",
                    params: reqParams
                };

                $http(req)
                    .then(function (result) {
                        var records = result.data.data.records.map(function (record) {
                            var srcObj = {};
                            var length = dataset.fields.length;
                            for (var i = 0; i < length; i++) {
                                var field = dataset.fields[i];
                                Object.defineProperty(srcObj, field, {
                                    value: record[i],
                                    writable: true,
                                    enumerable: true,
                                    configurable: true
                                });
                            }
                            return srcObj;
                        });
                        defer.resolve(records);
                    })
                    .catch(function (erro) {
                        console.log(error);
                    });

                return defer.promise;
            };

            /**
             * Insert or update based on the the datasource state
             */
            this.post = function (formData) {
                if (this.inserting) {

                    this.insert(this.active, function (obj) {

                        var dataset = datasetsList[this.target];
                        $timeout(function () {
                            dataset.fetch.call(dataset, this);
                        }.bind(this));

                    }.bind(this), 1);

                } else if (this.editing) {

                    // Quando a edição está sendo realizada em um form, como no caso do componente GridEditor.
                    if (formData) {
                        if (this.fields.length > 0) {
                            for (var i = 0; i < this.fields.length; i++) {
                                var field = this.fields[i];
                                if (field) {
                                    field = field.trim();
                                    if (formData.hasOwnProperty(field)) {
                                        this.active[field] = formData[field];
                                    }
                                }
                            }
                        }
                    }

                    this.update(this.active, this.oldActive, formData, function (obj) {

                        var dataset = datasetsList[this.target];
                        $timeout(function () {
                            dataset.fetch.call(dataset, this);
                        }.bind(this));

                    }.bind(this), 1);
                }

                // Set this datasource back to the normal state
                this.editing = false;
                this.inserting = false;
            };

            /**
             * Cancel the editing or inserting state
             */
            this.cancel = function () {
                if (this.inserting) {
                    this.active = this.data[0];
                }
                this.inserting = false;
                this.editing = false;
            };

            /**
             * Put the datasource into the inserting state
             */
            this.startInserting = function () {
                this.inserting = true;
                this.active = {};
                if (this.onStartInserting) {
                    this.onStartInserting();
                }
            };

            /**
             * Put the datasource into the editing state
             */
            this.startEditing = function (item) {
                if (item) {
                    this.copy(this.active, this.oldActive);
                    this.editing = true;
                }
            };

            /**
             * Ativa a edição de um determinado registro.
             * Esse método é utilizado apenas por componentes como GridEditor onde a edição é feita
             * diretamente na Grid sem a utilização de um formulário a parte.
             */
            this.editingForm = function (item, form) {
                this.startEditing(item);
                if (form)
                    form.$show();
            };

            /**
             * Cancela a edição do formulário.
             * @param form
             */
            this.cancelForm = function (form) {
                this.cancel();
                if (form)
                    form.$cancel();
            };

            /**
             * Get the object keys values from the datasource keylist
             * PRIVATE FUNCTION
             */
            var getKeyValues = function (rowData) {
                var keys = this.keys;
                var keyValues = {};
                for (var i = 0; i < this.keys.length; i++) {
                    keyValues[this.keys[i]] = rowData[this.keys[i]];
                }

                return keyValues;
            }.bind(this);

            /**
             * Check if two objects are equals by comparing their keys
             * PRIVATE FUNCTION
             */
            var objectIsEquals = function (object1, object2) {
                var keys1 = getKeyValues(object1);
                var keys2 = getKeyValues(object2);
                for (var key in keys1) {
                    if (keys1.hasOwnProperty(key)) {
                        if (!keys2.hasOwnProperty(key)) return false;
                        if (keys1[key] !== keys2[key]) return false;
                    }
                }
                return true;
            };

            /**
             * Check if the object has more itens to iterate
             */
            this.hasNext = function () {
                return this.data && (cursor < this.data.length - 1);
            };

            /**
             * Check if the cursor is not at the beginning of the datasource
             */
            this.hasPrevious = function () {
                return this.data && (cursor > 0);
            };

            /**
             * Check if the object has more itens to iterate
             */
            this.order = function (order) {
                _savedProps.order = order;
            };

            /**
             * Get the values of the active row as an array.
             * This method will ignore any keys and only return the values
             */
            this.getActiveValues = function () {
                if (this.active && !this._activeValues) {
                    $rootScope.$watch(function (scope) {
                            return this.active;
                        }.bind(this),
                        function (newValue, oldValue) {
                            this._activeValues = this.getRowValues(this.active);
                        }.bind(this), true);
                }
                return this._activeValues;
            };

            this.__defineGetter__('activeValues', function () {
                return _self.getActiveValues();
            });

            /**
             * Get the values of the given row
             */
            this.getRowValues = function (rowData) {
                var arr = [];
                for (var i in rowData) {
                    if (rowData.hasOwnProperty(i)) {
                        arr.push(rowData[i]);
                    }
                }
                return arr;
            };

            /**
             *  Get the current item moving the cursor to the next element
             */
            this.next = function () {
                if (!this.hasNext()) {
                    this.nextPage();
                }
                this.active = this.copy(this.data[++cursor], {});
                return this.active;
            };

            /**
             *  Try to fetch the previous page
             */
            this.nextPage = function () {
                if (!this.hasNextPage()) {
                    return;
                }
                this.offset = parseInt(this.offset) + parseInt(this.rowsPerPage);
                this.fetch(_savedProps, {
                    success: function (data) {
                        if (!data || data.length < parseInt(this.rowsPerPage)) {
                            this.offset = parseInt(this.offset) - this.data.length;
                        }
                    }
                }, true);
            };

            /**
             *  Try to fetch the previous page
             */
            this.prevPage = function () {
                if (!this.append && !this.preppend) {
                    this.offset = parseInt(this.offset) - this.data.length;

                    if (this.offset < 0) {
                        this.offset = 0;
                    } else if (this.offset >= 0) {
                        this.fetch(_savedProps, {
                            success: function (data) {
                                if (!data || data.length === 0) {
                                    this.offset = 0;
                                }
                            }
                        }, true);
                    }
                }
            };

            /**
             *  Check if has more pages
             */
            this.hasNextPage = function () {
                return hasMoreResults && (this.rowsPerPage != -1);
            };

            /**
             *  Check if has previews pages
             */
            this.hasPrevPage = function () {
                return this.offset > 0 && !this.append && !this.prepend;
            };

            /**
             *  Get the previous item
             */
            this.previous = function () {
                if (!this.hasPrevious()) throw "Dataset Overflor Error";
                this.active = this.copy(this.data[--cursor], {});
                return this.active;
            };

            /**
             *  Moves the cursor to the specified item
             */
            this.goTo = function (rowId) {
                for (var i = 0; i < this.data.length; i++) {
                    if (this.data[i][this.key] === rowId) {
                        cursor = i;
                        this.active = this.copy(this.data[cursor], {});
                        return this.active;
                    }
                }
            };

            /**
             *  Get the current cursor index
             */
            this.getCursor = function () {
                return cursor;
            };

            /**
             *  filter dataset by URL
             */
            this.filter = function (url) {
                var oldoffset = this.offset;
                this.offset = 0;
                this.fetch({path: url}, {
                    beforeFill: function (oldData) {
                        this.cleanup();
                    }, error: function (error) {
                        this.offset = oldoffset;
                    }
                });
            };

            /**
             * Cleanup datasource
             */
            this.cleanup = function () {
                this.offset = 0;
                this.data = [];
                this.cursor = -1;
                this.active = {};
                hasMoreResults = false;
            };

            /**
             *  Get the current row data
             */
            this.current = function () {
                return this.active || this.data[0];
            };

            /**
             *  Fetch all data from the server
             */
            this.fetch = function (properties, callbacksObj, isNextOrPrev) {

                // Ignore any call if the datasource is busy (fetching another request)
                if (this.busy) return;

                if (!this.enabled) {
                    this.cleanup();
                    return;
                }

                var dsActive = properties;

                var props = properties.active || {};
                var callbacks = callbacksObj || {};

                // Adjust property parameters and the endpoint url
                props.params = props.params || {};

                var resourceURL = this.tp + (props.path || "");

                var tempFilters = {
                    "_id": this.target
                };

                if (this.follow.length > 0) {
                    for (var i = 0; i < this.follow.length; i++) {
                        var masterName = this.follow[i];
                        if (datasetsList.hasOwnProperty(masterName)) {
                            var dsFollow = datasetsList[masterName];
                            var param = "_p_";
                            param = param + i;
                            Object.defineProperty(tempFilters, param, {
                                value: dsFollow.active[dsFollow.key],
                                writable: true,
                                enumerable: true,
                                configurable: true
                            });
                        }
                    }
                }

                // Set Limit and offset
                //if (this.rowsPerPage > 0) {
                //    props.params.limit = this.rowsPerPage;
                //    props.params.offset = this.offset;
                //}

                // Stop auto post for awhile
                this.stopAutoPost();

                // Store the last configuration for late use
                _savedProps = props;

                // Make the datasource busy
                busy = true;

                if (this.tp) {
                    // Get an ajax promise
                    this.$promise = $http({
                        url: resourceURL,
                        method: "POST",
                        params: tempFilters
                    }).success(function (data, status, headers, config) {
                        busy = false;
                        sucessHandler(data)
                    }.bind(this)).error(function (data, status, headers, config) {
                        busy = false;
                        this.handleError(data);
                        if (callbacks.error) callbacks.error.call(this, data);
                    }.bind(this));
                }

                // Success Handler
                var sucessHandler = function (data) {
                    if (data.data.records) {

                        var records = data.data.records;

                        if (Object.prototype.toString.call(records) !== '[object Array]') {
                            records = [records];
                        }

                        // Call the before fill callback
                        if (callbacks.beforeFill)
                            callbacks.beforeFill.apply(this, this.data);

                        /**
                         * Escrita do objeto JSON com os dados de retorno da requisição AJAX.
                         *
                         * @type {Array}
                         */
                        var dataObjects = [];
                        for (var i = 0; i < records.length; i++) {
                            var record = records[i];
                            var tempObject = {};
                            for (var j = 0; j < this.fields.length; j++) {
                                var field = this.fields[j];
                                if (field) {
                                    field = field.trim();
                                    var recordValue = record[j];
                                    if (recordValue) {
                                        Object.defineProperty(tempObject, field, {
                                            value: this.getJSValue(recordValue),
                                            writable: true,
                                            enumerable: true,
                                            configurable: true
                                        });
                                    }
                                }
                            }
                            dataObjects[i] = tempObject;
                        }

                        records = dataObjects;

                        if (isNextOrPrev) {
                            // If prepend property was set.
                            // Add the new data before the old one
                            if (this.prepend) this.data = records.concat(this.data);

                            // If append property was set.
                            // Add the new data after the old one
                            if (this.append) this.data = this.data.concat(records);

                            // When neither  nor preppend was set
                            // Just replace the current data
                            if (!this.prepend && !this.append) {
                                this.data = records;
                                if (this.data.length > 0) {
                                    this.active = records[0];
                                    cursor = 0;
                                } else {
                                    this.active = {};
                                    cursor = -1;
                                }
                            }
                        } else {
                            this.cleanup();
                            this.data = records;
                            if (this.data.length > 0) {
                                this.active = records[0];
                                cursor = 0;
                            }
                        }

                        if (callbacks.success)
                            callbacks.success.call(this, records);

                        hasMoreResults = (records.length >= this.rowsPerPage);

                        /*
                         *  Register a watcher for data
                         *  if the autopost property was set
                         *  It means that any change on dataset items will
                         *  generate a new request on the server
                         */
                        if (this.autoPost)
                            this.startAutoPost();
                    }

                    /**
                     * Tratando chamadas ao controllerAfter e controllerBefore.
                     */
                    if (data.commands && data.commands.length > 0) {

                        var commands = data.commands;

                        if (commands[0].hasOwnProperty("jsCode")) {
                            var regExp = new RegExp("'", 'g');
                            var jsCode = commands[0].jsCode;

                            var component = jsCode.substring(jsCode.indexOf("'"), jsCode.indexOf(","));
                            component = component.replace(regExp, "");

                            var value = jsCode.substring(jsCode.indexOf(",") + 1, jsCode.indexOf(",("));
                            value = value.replace(regExp, "");

                            var dataset = datasetsList[component];
                            if (dataset) {
                                dataset.active[dataset.key] = value;
                                dataset.data[0] = data.active;
                            }
                        }
                    }

                }.bind(this);

                /*
                 * Atualiza automaticamente os observadores do objeto.
                 */
                this.onNotifyObservers();

                /*
                 * Definindo valor padrão da chave.
                 */
                if (this.defaultValue) {
                    this.active[this.key] = this.defaultValue;
                }
            };

            /**
             * Obtem o valor correto de acordo com uma suposição de seu tipo.
             * @param value Valor a ser considerado.
             */
            this.getJSValue = function (value) {
                var result = undefined;
                if (typeof value === "undefined") {
                    result = "";
                } else if (typeof value === "string") {
                    result = value.trim();
                    if (value === "S" || value === "N")
                        result = value === "S" ? true : false;
                }
                return result;
            };

            /**
             * Obtem o valor no formato correto a ser trabalhado pelo framework Cronos.
             * @param value Valor original a ser validado.
             */
            this.getCronosValue = function (value) {
                var result = undefined;
                switch (typeof value) {
                    case "string":
                        result = value.trim();
                        break;
                    case "boolean":
                        result = (value ? "S" : "N");
                        break;
                    default:
                        result = "";
                }
                return result;
            };

            /**
             * Asynchronously notify observers
             */
            this.notifyObservers = function () {
                for (var key in this.observers) {
                    if (this.observers.hasOwnProperty(key)) {
                        var dataset = this.observers[key];
                        $timeout(function () {
                            dataset.notify.call(dataset, this.active);
                        }.bind(this), 1);
                    }
                }
            };

            /**
             *
             */
            this.onNotifyObservers = function () {
                if (dsObservables.hasOwnProperty(this.name)) {
                    var dataset = dsObservables[this.name];
                    $timeout(function () {
                        dataset.fetch.call(dataset, this);
                    }.bind(this), 1);
                }
            };

            /**
             *
             * @param item
             */
            this.onLineSelected = function (item) {
                if (item) {
                    this.active = this.copy(item);
                    this.oldActive = this.copy(item);
                }
            };

            this.notify = function (activeRow) {
                if (activeRow) {
                    // Parse the filter using regex
                    // to identify {params}
                    var filter = this.watchFilter;
                    var pattern = /\{([A-z][A-z|0-9]*)\}/gim;

                    // replace all params found by the
                    // respectiveValues in activeRow
                    filter = filter.replace(pattern, function (a, b) {
                        return activeRow.hasOwnProperty(b) ? activeRow[b] : "";
                    });

                    this.fetch({
                        params: {
                            q: filter
                        }
                    });
                }
            };

            this.addObserver = function (observer) {
                this.observers.push(observer);
            };

            /**
             * Clone a JSON Object
             */
            this.copy = function (from, to) {
                if (from === null || Object.prototype.toString.call(from) !== '[object Object]')
                    return from;

                to = to || {};

                for (var key in from) {
                    if (from.hasOwnProperty(key) && key.indexOf('$') == -1) {
                        to[key] = this.copy(from[key]);
                    }
                }
                return to;
            };

            /**
             * Used to monitore the this datasource data for change (insertion and deletion)
             */
            this.startAutoPost = function () {
                unregisterDataWatch = $rootScope.$watch(function () {
                    return this.data;
                }.bind(this), function (newData, oldData) {

                    if (!this.enabled) {
                        unregisterDataWatch();
                        return;
                    }

                    // Get the difference between both arrays
                    var difSize = newData.length - oldData.length;

                    if (difSize > 0) {
                        // If the value is positive
                        // Some item was added
                        for (var i = 1; i <= difSize; i++) {
                            // Make a new request
                            this.insert(newData[newData.length - i], function () {
                            });
                        }
                    } else if (difSize < 0) {
                        // If it is negative
                        // Some item was removed
                        var removedItems = oldData.filter(function (oldItem) {
                            return newData.filter(function (newItem) {
                                    return objectIsEquals(oldItem, newItem);
                                }).length == 0;
                        });

                        for (var i = 0; i < removedItems.length; i++) {
                            this.remove(removedItems[i], function () {
                            });
                        }

                    }
                }.bind(this));
            };

            /**
             * Unregister the data watcher
             */
            this.stopAutoPost = function () {
                // Unregister any defined watcher on data variable
                if (unregisterDataWatch) {
                    unregisterDataWatch();
                    unregisterDataWatch = undefined;
                }
            };

        };

        /**
         * Dataset Manager Methods
         */
        this.storeDataset = function (dataset) {
            this.datasets[dataset.name] = dataset;
            datasetsList[dataset.name] = dataset;
        };

        /**
         * Initialize a new dataset
         */
        this.initDataset = function (props) {

            var endpoint = (props.endpoint) ? props.endpoint : "";

            var dts = new DataSet(props.name);

            dts.name = props.name;
            dts.tp = props.tp;
            dts.target = props.target;
            dts.filters = props.filters;
            dts.fields = props.fields;
            dts.follow = props.follow;
            dts.record = props.record;
            dts.key = props.key;
            dts.defaultValue = props.defaultValue;

            // old props
            dts.entity = props.entity;
            dts.keys = (props.keys && props.keys.length > 0) ? props.keys.split(",") : [];
            dts.rowsPerPage = props.rowsPerPage ? props.rowsPerPage : 100; // Default 100 rows per page
            dts.append = props.append;
            dts.prepend = props.prepend;
            dts.endpoint = props.endpoint;
            dts.filterURL = props.filterURL;
            dts.autoPost = props.autoPost;
            dts.deleteMessage = props.deleteMessage;
            dts.enabled = props.enabled;
            dts.offset = (props.offset) ? props.offset : 0; // Default offset is 0
            dts.onError = props.onError;
            dts.defaultNotSpecifiedErrorMessage = props.defaultNotSpecifiedErrorMessage;

            // Check for headers
            if (props.headers && props.headers.length > 0) {
                dts.headers = {};
                var headers = props.headers.trim().split(";");
                var header;
                for (var i = 0; i < headers.length; i++) {
                    header = headers[i].split(":");
                    if (header.length === 2) {
                        dts.headers[header[0]] = header[1];
                    }
                }
            }

            // Init
            dts.init();
            this.storeDataset(dts);

            if (props.follow.length > 0) {

                for (var i = 0; i < props.follow.length; i++) {
                    var master = props.follow[i];
                    dsObservables[master] = dts;
                }

            } else if (!props.lazy && (Object.prototype.toString.call(props.watch) !== "[object String]") && !props.filterURL) {
                // Query string object
                var queryObj = {};

                // Fill the dataset
                dts.fetch({params: queryObj}, {
                    success: function (data) {
                        if (data && data.length > 0) {
                            this.active = data[0];
                            this.cursor = 0;
                        }
                    }
                });
            }

            if (props.lazy && props.autoPost) {
                dts.startAutoPost();
            }

            if (props.watch && Object.prototype.toString.call(props.watch) === "[object String]") {
                this.registerObserver(props.watch, dts);
                dts.watchFilter = props.watchFilter;
            }

            // Filter the dataset if the filter property was set
            if (props.filterURL && props.filterURL.length > 0) {
                dts.filter(props.filterURL);
            }

            // Add this instance into the root scope
            // This will expose the dataset name as a
            // global variable
            $rootScope[dts.name] = dts;
            window[dts.name] = dts;

            return dts;
        };

        /**
         * Register a dataset as an observer to another one
         */
        this.registerObserver = function (masterName, dataset) {
            this.datasets[masterName].addObserver(dataset);
        };

        return this;
    }
    ])

    /**
     * Cronos Dataset Directive
     */
    .directive('legacyDatasource', ['DatasetManager', '$timeout', '$parse', 'Notification', function (DatasetManager, $timeout, $parse, Notification) {
        return {
            restrict: 'E',
            scope: true,
            template: '',
            link: function (scope, element, attrs) {
                var init = function () {
                    var props = {
                        name: attrs.name,
                        tp: attrs.tp,
                        target: attrs.target,
                        fields: (attrs.fields) ? attrs.fields : [],
                        follow: (attrs.follow) ? attrs.follow : [],
                        record: attrs.record,
                        key: attrs.key,
                        defaultValue: (attrs.defaultValue) ? attrs.defaultValue : "",

                        // old attrs
                        entity: attrs.entity,
                        enabled: (attrs.hasOwnProperty('enabled')) ? (attrs.enabled === "true") : true,
                        keys: attrs.keys,
                        endpoint: attrs.endpoint,
                        lazy: (attrs.hasOwnProperty('lazy') && attrs.lazy === "") || attrs.lazy === "true",
                        append: !attrs.hasOwnProperty('append') || attrs.append === "true",
                        prepend: (attrs.hasOwnProperty('prepend') && attrs.prepend === "") || attrs.prepend === "true",
                        watch: attrs.watch,
                        rowsPerPage: attrs.rowsPerPage,
                        offset: attrs.offset,
                        filterURL: attrs.filter,
                        watchFilter: attrs.watchFilter,
                        deleteMessage: attrs.deleteMessage || attrs.deleteMessage === "" ? attrs.deleteMessage : "Do you whant to remove?",
                        headers: attrs.headers,
                        autoPost: (attrs.hasOwnProperty('autoPost') && attrs.autoPost === "") || attrs.autoPost === "true",
                        onError: function (error) {
                            Notification.error(error);
                        },
                        defaultNotSpecifiedErrorMessage: "Error not specified"
                    };

                    if (Object.prototype.toString.call(props.fields) !== '[object Array]') {
                        props.fields = props.fields.split(",");
                    }

                    if (Object.prototype.toString.call(props.follow) !== '[object Array]') {
                        props.follow = props.follow.split(",");
                    }

                    var firstLoad = {
                        filter: true,
                        entity: true,
                        enabled: true
                    };

                    var datasource = DatasetManager.initDataset(props);

                    var timeoutPromise;

                    attrs.$observe('filter', function (value) {
                        if (!firstLoad.filter) {
                            // Stop the pending timeout
                            $timeout.cancel(timeoutPromise);

                            // Start a timeout
                            timeoutPromise = $timeout(function () {
                                datasource.filter(value);
                            }, 200);
                        } else {
                            $timeout(function () {
                                firstLoad.filter = false;
                            });
                        }
                    });

                    attrs.$observe('enabled', function (value) {
                        if (!firstLoad.enabled) {
                            datasource.enabled = (value === "true");
                            datasource.fetch({params: {}});
                        } else {
                            $timeout(function () {
                                firstLoad.enabled = false;
                            });
                        }
                    });

                    attrs.$observe('entity', function (value) {
                        datasource.entity = value;
                        if (!firstLoad.entity) {
                            // Only fetch if it's not the first load
                            datasource.fetch({params: {}});
                        } else {
                            $timeout(function () {
                                firstLoad.entity = false;
                            });
                        }
                    });

                };
                init();
            }
        };
    }])

    .directive('useDatasource', ['DatasetManager', '$parse', function (DatasetManager, $parse) {
        return {
            restrict: 'A',
            scope: true,
            link: function (scope, element, attrs) {
                scope.data = DatasetManager.datasets;
                if (scope.data[attrs.useDatasource]) {
                    scope.datasource = scope.data[attrs.useDatasource];
                } else {
                    scope.datasource = {};
                    scope.datasource.data = $parse(attrs.useDatasource)(scope);
                }
            }
        };
    }]);

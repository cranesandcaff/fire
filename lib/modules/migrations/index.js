'use strict';

exports = module.exports = Migrations;

var Migration = require('./migration');
var Schema = require('./schema');

var PropertyTypes = require('./../models/property-types');
var Model = require('./../models/model');

var utils = require('./../../helpers/utils');

var util = require('util');
var path = require('path');
var Q = require('q');

var debug = require('debug')('fire:migration');

/**
 * This module loads all migrations.
 *
 * @access private
 *
 * @constructor
 */
function Migrations() {
    this._ = [];
    this.models = null;
    this.version = 0;
}

/**
 * Helpers method to reset all models on the current models module.
 */
Migrations.prototype.resetAllModels = function() {
    debug('Migrations#resetAllModels');

    var self = this;
    this.models.forEach(function(model) {
        if(model != self.models.Schema) {
            var modelName = model.getName();

            debug('Reset model `' + modelName + '`.');

            delete self.models[modelName];
            delete self.models.internals[modelName];
        }
    });
};

/**
 * @todo Move this method to tests.
 *
 * This method destroys all models. Destroying a model means dropping the sql table completely.
 */
Migrations.prototype.destroyAllModels = function() {
    var result = Q.when(true);

    this.models.forEach(function(model) {
        result = result.then(function() {
            return model.exists()
                .then(function(exists) {
                    if(exists) {
                        return model.forceDestroy();
                    }
                    else {
                        return Q.when(true);
                    }
                });
        });
    });

    return result;
};

/**
 * Finds the latest Schema instance from the database and returns it's version, or 0 if not schema is found.
 */
Migrations.prototype.currentVersion = function() {
    return this.models.Schema.findOne({}, {orderBy:{version:'desc'}})
        .then(function(schema) {
            return schema && schema.version || 0;
        });
};

/**
 * Executes a soft migration.
 *
 * A soft migration executes all migrations, but doesn't execute any queries to the database. This is useful to create any forward references for the actual migration.
 *
 * @param {Number} toVersion The version to migrate to.
 */
Migrations.prototype.softMigrate = function(toVersion) {
    var changes = this._.filter(function(migration) {
        return (migration.version <= toVersion);
    });

    return utils.invokeSeries(changes, 'soft');
};

/**
 * This method actually migrates the database based on the existing migration files.
 *
 * @param  {Number} fromVersion The version to migrate from, usually the current version.
 * @param  {Number} toVersion   The version to migrate to, usually the latest version.
 * @return {Promise}
 */
Migrations.prototype.migrate = function(fromVersion, toVersion) {
    debug('Migrations#migrate ' + fromVersion + ' to ' + toVersion);

    var self = this;
    return this.softMigrate(fromVersion)
        .then(function() {
            var direction        = '';
            var changes          = [];

            if(fromVersion < toVersion) {
                direction = 'up';

                changes = self._.filter(function(migration) {
                    return (migration.version > fromVersion && migration.version <= toVersion);
                });
            }
            else if(fromVersion > toVersion) {
                //we're going down
                direction = 'down';

                changes = self._.reverse().filter(function(migration) {
                    return (migration.version <= fromVersion && migration.version > toVersion);
                });
            }
            else {
                throw new Error('The current database is already at version `' + toVersion + '`.');
            }

            if(Math.abs(fromVersion - toVersion) != changes.length) {
                throw new Error('Migrations from version `' + fromVersion + '` to version `' + toVersion + '`: found only `' + changes.length + '` migrations expected `' + Math.abs(fromVersion - toVersion) + '`. Did you create all migrations?');
            }

            return utils.invokeSeries(changes, 'go', direction);
        })
        .catch(function(error) {
            throw error;
        });
};

/**
 * Loads all the migration files to models.
 *
 * @param {String} fullPath The path to the directory where the migration files are located.
 * @param {Models} models   The models module.
 */
Migrations.prototype.loadMigrations = function(fullPath, models) {
    this.models = models;

    var self = this;
    utils.readDirSync(fullPath, function(filePath) {
        if(path.extname(filePath) != '.js') {
            debug('Not loading `' + filePath + '` because extension is `' + path.extname(filePath) + '`.');
        }
        else {
            debug('Migrations#load ' + filePath);

            var MigrationClass = require(filePath);

            var fileName = path.basename(filePath);

            var version = parseInt(utils.captureOne(fileName, /^([0-9]+)\-/));
            if(version) {
                self.addMigration(MigrationClass, version);
            }
            else {
                throw new Error('Invalid migration file name for file at path `' + filePath + '`.');
            }
        }
    });

    this._ = this._.sort(function(a, b) {
        return (a.version - b.version);
    });
};

/**
 * Sets up the migrations by loading the migration files and creating the Schema model, if it does not exist.
 *
 * This method is invoked before actually migrating the database.
 *
 * @param  {String} fullPath The path to the migrations directory, usually app path + /_migrations.
 * @param  {Models} models   The models to load the migrations into.
 * @return {Promise}          Resolves or rejects when the setup succeeds or fails.
 */
Migrations.prototype.setup = function(fullPath, models) {
    var defer = Q.defer();

    this.loadMigrations(fullPath, models);

    // Let's inject our Schema model.
    util.inherits(Schema, Model);
    this.models.addModelConstructor(Schema);

    var self = this;
    setImmediate(function() {
        self.models.Schema.exists()
            .then(function(exists) {
                if(!exists) {
                    return self.models.Schema.setup();
                }
                else {
                    return true;
                }
            })
            .then(function() {
                defer.resolve();
            })
            .catch(function(error) {
                defer.reject(error);
            })
            .done();
    });

    return defer.promise;
};

/**
 * Loads the migration class.
 *
 * @param {String} MigrationClass The migration to load. This is actually a constructor function.
 * @param {Number} version        The version number of the migration.
 */
Migrations.prototype.addMigration = function(MigrationClass, version) {
    if(!MigrationClass) {
        throw new Error('No migration class in Migrations#addMigration.');
    }

    debug('addMigration ' + version);

    // TODO: replace with actual inheritance?
    var method;
    for(method in Migration.prototype) {
        MigrationClass.prototype[method] = Migration.prototype[method];
    }

    Object.keys(PropertyTypes).forEach(function(propertyName) {
        // We check if it's set already, as e.g. migrations swizzle these methods
        if(!MigrationClass.prototype[propertyName]) {
            MigrationClass.prototype[propertyName] = PropertyTypes[propertyName];
        }
    });

    var migration = new MigrationClass();
    Migration.call(migration, version, this.models);

    if(!(typeof migration.up == 'function' && typeof migration.down == 'function')) {
        throw new Error('Migration with version `' + version + '` does not contain both an `up` and a `down` method.');
    }

    this._.push(migration);
};

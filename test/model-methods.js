var fire = require('..');
var Models = require('./../lib/models');
var assert = require('assert');
var Q = require('q');

describe('models', function() {
    var models;
    beforeEach(function(done) {
        models = new Models();
        models.setup(null)
            .then(function() {
                done();
            })
            .done();
    });

    afterEach(function(done) {
        // TODO: We should drop everything in beforeEach instead.

        Q.when(models.Schema && models.Schema.destroy())
        .then(function() {
            return models.ModelFour && models.ModelFour.destroy();
        })
        .then(function() {
            return models.ModelThree && models.ModelThree.destroy();
        })
        .then(function() {
            models = null;
            done();
        })
        .fail(function(error) {
            console.log(error);
            console.log(error.stack);

            throw error;
        })
    });

    it('can reference model', function(done) {
        function ModelOne() {
            this.name = [this.Text];
        }

        models.addModel(ModelOne);

        function ModelTwo(models) {
            this.ref = [this.Reference(models.ModelOne)];
        }

        models.addModel(ModelTwo);

        done();
    });

    it('can create model when calling findOrCreateOne()', function(done) {
        function ModelThree() {
            this.name = [this.String];
            this.value = [this.Integer];
        }
        models.addModel(ModelThree);
        return models.ModelThree.setup()
            .then(function() {
                return models.ModelThree.findOrCreateOne({name: 'Test'}, {value: 123});
            })
            .then(function(model) {
                assert.equal(model.name, 'Test');
                assert.equal(model.value, 123);

                done();
            })
            .done();
    })

    it('can find model with null column', function(done) {
        function ModelThree() {
            this.name = [this.String];
        }
        models.addModel(ModelThree);
        return models.ModelThree.setup()
        .then(function() {
            return models.ModelThree.createOne({name:null});
        })
        .then(function() {
            return models.ModelThree.findOne({});
        })
        .then(function(model) {
            assert.notEqual(model, null);
            assert.equal(model.name, null);
            return true;
        })
        .then(function() {
            return models.ModelThree.execute('SELECT * FROM "model_threes" WHERE "name" IS NULL LIMIT 1');
        })
        .then(function(model) {
            assert.notEqual(model, null);
            assert.equal(model.name, null);
            return true;
        })
        .then(function() {
            return models.ModelThree.findOne({name:null});
        })
        .then(function(model) {
            assert.notEqual(model, null);
            done();
        })
        .fail(function(error) {
            done(error);
        })
    });

    it('can update with relation', function(done) {
        function ModelThree() {
            this.name = [this.String];
        }
        models.addModel(ModelThree);

        function ModelFour() {
            this.name = [this.String];
            this.three = [this.Reference(models.ModelThree)];
        }
        models.addModel(ModelFour);

        return models.ModelThree.setup()
        .then(function() {
            return models.ModelFour.setup();
        })
        .then(function() {
            return models.ModelThree.createOne({
                name: 'Test 1'
            });
        })
        .then(function(modelThree) {
            assert.notEqual(modelThree, null);
            assert.equal(modelThree.name, 'Test 1');

            return models.ModelFour.createOne({
                three: modelThree
            })
            .then(function(modelFour) {
                assert.notEqual(modelFour, null);
                assert.equal(modelFour.three, 1);

                return models.ModelFour.updateOne({
                    id: modelFour.id,
                    three: modelThree
                }, {name:'Test 2'});
            })
        })
        .then(function(modelFour) {
            assert.notEqual(modelFour, null);
            assert.equal(modelFour.name, 'Test 2');
            done();
        })
        .fail(function(error) {
            console.log(error);
            console.log(error.stack);

            done(error);
        })
    })

    it('can query on date', function(done) {
        function ModelThree() {
            this.name       = [this.String];
            this.createdAt  = [this.DateTime];
        }
        models.addModel(ModelThree);

        var startDate = new Date(2014, 10, 23);
        var endDate = new Date(2014, 10, 24);
        var outsideDate = new Date(2015, 0, 1);

        return models.ModelThree.setup()
        .then(function() {
            return models.ModelThree.createOne({
                createdAt: startDate
            });
        })
        .then(function() {
            return models.ModelThree.createOne({
                createdAt: endDate
            });
        })
        .then(function() {
            return models.ModelThree.createOne({
                createdAt: outsideDate
            });
        })
        .then(function() {
            return models.ModelThree.findOne({
                createdAt: {
                    $gte: startDate,
                    $lt: endDate
                }
            });
        })
        .then(function(model) {
            assert.notEqual(model, null);
            done();
        })
        .fail(function(error) {
            done(error);
        })
    });
});
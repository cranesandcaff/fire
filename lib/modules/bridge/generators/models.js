var Generator = require('../generator');
var debug = require('debug')('fire:bridge');
var inflection = require('inflection');
var utils = require('../../../helpers/utils');
var path = require('path');

/**
 * Generates a client-side library to manage your models with a 1-to-1 API as the models api on the server-context.
 *
 * For more information on the API itself, see the Models module.
 *
 * @name Bridge~generateModels
 * @return {Generator} A generator instance which holds the information to render this module.
 */
exports = module.exports = function() {
	var models = [];

	this.app.models.forEach(function(model) {
		var modelName = model.getName();

		var properties = [];

		var allProperties = model.getAllProperties();
		var propertyNames = Object.keys(allProperties);

		var methodMaps = [];

		debug('Generate model `' + modelName + '`.');
		debug(propertyNames);

		debug('Authenticator: ' + model.isAuthenticator());

		propertyNames.forEach(function(propertyName) {
			var property = allProperties[propertyName];

			if(!property.options.isPrivate) {
				if(property.isAssociation()) {
					if(property.isManyToMany()) {
						methodMaps.push({
							manyToMany: true,
							createMethodName: 'create' + utils.ucfirst(inflection.singularize(propertyName)),
							removeMethodName: 'remove' + utils.ucfirst(inflection.singularize(propertyName)),
							resource: propertyName
						});
					}
					else if(property.options.hasMany) {
						if(!property.options.relationshipVia) {
							throw new Error('Found has many relationship but could not find link. Did you call HasMany-BelongsTo on the correct models?');
						}

						methodMaps.push({
							getMethodName: 'get' + inflection.capitalize(propertyName),
							resource: propertyName,
							modelName: property.options.relationshipVia.model.getName()
						});
					}
				}
				else if(property.options.hasMethod) {
					methodMaps.push({
						getMethodName: 'get' + inflection.capitalize(propertyName),
						resource: propertyName,
						modelName: property.options.hasModel.getName()
					});
				}

				properties.push(property);
			}
		});

		models.push({
			name: modelName,
			properties: properties,
			resource: inflection.transform(modelName, ['tableize', 'dasherize']).toLowerCase(),
			isAuthenticator: model.isAuthenticator(),
			authenticatingPropertyName: model.options.authenticatingProperty ? model.options.authenticatingProperty.name : null,
			methods: methodMaps
		});
	});

	return new Generator(path.join(__dirname, '../templates/models-js.mu'), {models: models});
};

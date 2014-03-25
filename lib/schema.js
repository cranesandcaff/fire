'use strict';

exports = module.exports = Schema;

function Schema(models) {
    this.version = [this.Integer];
    this.createdAt = [this.DateTime, this.Default('CURRENT_DATE')];
}
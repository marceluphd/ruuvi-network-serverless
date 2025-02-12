const gatewayHelper = require('../Helpers/gatewayHelper');
const auth = require('../Helpers/authHelper');
const validator = require('../Helpers/validator');

const mysql = require('serverless-mysql')({
    config: {
        host     : process.env.DATABASE_ENDPOINT,
        database : process.env.DATABASE_NAME,
        user     : process.env.DATABASE_USERNAME,
        password : process.env.DATABASE_PASSWORD
    }
});

exports.handler = async (event, context) => {
    const user = await auth.authorizedUser(event.headers);
    if (!user) {
        return gatewayHelper.unauthorizedResponse();
    }

    const eventBody = JSON.parse(event.body);

    if (!eventBody || !validator.hasKeys(eventBody, ['name', 'value'])) {
        return gatewayHelper.errorResponse(gatewayHelper.HTTPCodes.INVALID, "Missing setting name or value.", errorCodes.ER_MISSING_ARGUMENT);
    }

    if (!validator.validateSettingName(eventBody.name)) {
        return gatewayHelper.errorResponse(gatewayHelper.HTTPCodes.INVALID, "Invalid characters in name. Allowed alphanumeric, '-', '_' and '.'.", errorCodes.ER_INVALID_FORMAT);
    }

    let settings = null;
    try {
        settings = await mysql.query({
            sql: 
                `INSERT INTO user_settings (\`user_id\`, \`key\`, \`value\`)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    \`value\` = VALUES(\`value\`),
                    updated_at = CURRENT_TIMESTAMP`,
            timeout: 10000,
            values: [user.id, eventBody.name, eventBody.value]
        });
        await mysql.end();
    } catch (e) {
		if (results.affectedRows && results.affectedRows === 1) {
            return gatewayHelper.errorResponse(HTTPCodes.INTERNAL, 'Error closing connection.', errorCodes.ER_INTERNAL, errorCodes.ER_SUB_DATA_STORAGE_ERROR);
        }
        return gatewayHelper.errorResponse(HTTPCodes.INTERNAL, 'Error storing user metadata.', errorCodes.ER_INTERNAL, errorCodes.ER_SUB_DATA_STORAGE_ERROR);
    }

    let res = 'unchanged';
    if (settings.affectedRows === 1) {
        res = 'added';
    } else if (settings.affectedRows === 2) {
        res = 'updated';
    }

    return gatewayHelper.successResponse({
        action: res
    });
}

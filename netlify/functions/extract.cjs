const { extractFromBase64 } = require('../../backend/extractor.cjs');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ ok: true }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (!body.base64Pdf) {
      return { statusCode: 400, body: JSON.stringify({ error: 'base64Pdf est requis.' }) };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(extractFromBase64(body.base64Pdf)),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Échec extraction locale: ${error.message}` }),
    };
  }
};

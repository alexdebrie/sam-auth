const crypto = require("crypto");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const SSM = new AWS.SSM();

module.exports.handler = async (event, context) => {
  const parameterResponse = await SSM.getParameter({
    Name: "OrderToken",
    WithDecryption: true,
  }).promise();
  const AUTH_TOKEN = parameterResponse.Parameter.Value;

  const { Authorization } = event.headers;

  if (!Authorization || Authorization !== AUTH_TOKEN) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: "Unauthorized.",
      }),
    };
  }

  const id = crypto.randomBytes(10).toString("hex");

  const response = await docClient
    .put({
      TableName: process.env.TABLE_NAME,
      Item: {
        orderId: id,
        orderTime: new Date().toISOString(),
      },
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({
      orderId: id,
    }),
  };
};

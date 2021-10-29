const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event, context) => {
  const { orderId } = event.pathParameters;

  const response = await docClient
    .get({
      TableName: process.env.TABLE_NAME,
      Key: { orderId: orderId },
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({
      order: response.Item,
    }),
  };
};

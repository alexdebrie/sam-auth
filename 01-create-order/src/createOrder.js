const crypto = require("crypto");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event, context) => {
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

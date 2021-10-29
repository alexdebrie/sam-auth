const AWS = require("aws-sdk");
const SSM = new AWS.SSM();

module.exports.handler = async (event, context) => {
  const parameterResponse = await SSM.getParameter({
    Name: "OrderToken",
    WithDecryption: true,
  }).promise();
  const AUTH_TOKEN = parameterResponse.Parameter.Value;

  if (event.authorizationToken !== AUTH_TOKEN) {
    return {
      principalId: "vendor",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect: "Deny",
            Resource: "*",
          },
        ],
      },
    };
  }

  return {
    principalId: "vendor",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: event.methodArn,
        },
      ],
    },
  };
};

import { APIGatewayEvent } from 'aws-lambda'

export const handler = async (_: APIGatewayEvent) => {
  // TODO implement
  const response = {
    statusCode: 200,
    body: JSON.stringify('Hello from Lambda!'),
  }
  return response
}

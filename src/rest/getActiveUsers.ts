import { DynamoDB } from 'aws-sdk'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// DynamoDBクライアントの初期化
const dynamodb = new DynamoDB.DocumentClient()
const sessionsTable = 'sessions'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const teamCode = event.pathParameters?.team_code

    if (!teamCode) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing 'team_code' path parameter.",
        }),
      }
    }

    const scanParams = {
      TableName: sessionsTable,
      FilterExpression: '#attribute = :value',
      ExpressionAttributeNames: {
        '#attribute': 'team_code',
      },
      ExpressionAttributeValues: {
        ':value': teamCode,
      },
    }

    // DynamoDBからセッション情報を取得
    const { Items } = await dynamodb.scan(scanParams).promise()

    if (!Items || Items.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      }
    }

    const data = Items.map(({ team_code, user_id }) => ({ team_code, user_id }))

    // 成功レスポンス
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    }
  } catch (error) {
    console.error('Error fetching active user:', error)

    // エラーレスポンス
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch active user data.',
      }),
    }
  }
}

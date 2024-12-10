import { DynamoDB, ApiGatewayManagementApi, AWSError } from 'aws-sdk'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// DynamoDB クライアントの初期化
const dynamodb = new DynamoDB.DocumentClient()
const sessionsTable = 'sessions'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext?.connectionId
  const teamCode = event.queryStringParameters?.team_code
  const userId = event.queryStringParameters?.user_id

  if (!teamCode || !userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Error: team_code and user_id are required.',
      }),
    }
  }

  const putParams = {
    TableName: sessionsTable,
    Item: {
      connection_id: connectionId,
      team_code: teamCode,
      user_id: userId,
    },
  }

  try {
    // 接続情報を保存
    await dynamodb.put(putParams).promise()

    const scanParams = {
      TableName: sessionsTable,
      FilterExpression: '#team_code = :team_code',
      ExpressionAttributeNames: {
        '#team_code': 'team_code',
      },
      ExpressionAttributeValues: {
        ':team_code': teamCode,
      },
    }

    // DynamoDBからセッション情報を取得
    const { Items = [] } = await dynamodb.scan(scanParams).promise()

    // 全接続ユーザーの情報を作成
    const activeUserIds = Items.map((item) => item.user_id)

    // API Gateway Management APIのインスタンス作成
    const apiGateway = new ApiGatewayManagementApi({
      endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    })

    // WebSocket経由でメッセージを送信
    const postPromises = Items.flatMap(async (item) => {
      // 確実に接続の完了が保証されていないので、自身のconnection_idは除外
      if (item.connection_id === connectionId) {
        await Promise.resolve([])
        return
      }

      try {
        await apiGateway
          .postToConnection({
            ConnectionId: item.connection_id as string,
            Data: JSON.stringify({ action: 'connect', data: { activeUserIds } }),
          })
          .promise()
      } catch (err) {
        // 切断された接続を削除
        const awsError = err as AWSError
        if (awsError.statusCode === 410) {
          await dynamodb
            .delete({
              TableName: sessionsTable,
              Key: { connection_id: item.connection_id },
            })
            .promise()
        }
      }
    })

    // 全ての送信タスクを完了させる
    await Promise.all(postPromises)

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connection successful!' }),
    }
  } catch (err) {
    console.error('Error:', err)

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process connection.' }),
    }
  }
}

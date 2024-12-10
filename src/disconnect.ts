import { DynamoDB, ApiGatewayManagementApi, AWSError } from 'aws-sdk'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// DynamoDBクライアントの初期化
const dynamodb = new DynamoDB.DocumentClient()
const sessionsTable = 'sessions'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext?.connectionId

  const params = {
    TableName: sessionsTable,
    Key: {
      connection_id: connectionId,
    },
  }

  try {
    const target = await dynamodb.get(params).promise()

    // 接続情報を削除
    await dynamodb.delete(params).promise()

    const scanParams = {
      TableName: sessionsTable,
      FilterExpression: '#team_code = :team_code',
      ExpressionAttributeNames: {
        '#team_code': 'team_code',
      },
      ExpressionAttributeValues: {
        ':team_code': target.Item?.team_code,
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
    const postPromises = Items.map(async (item) => {
      // 既に接続が切断されているので、自身のconnection_idは除外
      if (item.connection_id === connectionId) {
        await Promise.resolve([])
        return
      }

      try {
        await apiGateway
          .postToConnection({
            ConnectionId: item.connection_id as string,
            Data: JSON.stringify({ action: 'disconnect', data: { activeUserIds } }),
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
      body: 'Disconnection and session removal successful!',
    }
  } catch (error) {
    console.error('Error:', error)

    return {
      statusCode: 500,
      body: 'Failed to process disconnection.',
    }
  }
}

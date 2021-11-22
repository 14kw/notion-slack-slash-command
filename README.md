# Notion Slack Slash Command

特定のNotion DatabaseにItemを追加するSlack Slash Command.

`/notion list` 現在のチャンネルに設定されているコマンド名とデータベース  
`/notion set {command} {databaseId}` 現在のチャンネルにコマンド名をデータベースを登録する  
`/notion del {command}` 現在のチャンネルに登録したコマンド名を削除する  
`/notion {command} {summary}` コマンド名に紐付いたデータベースに新しいアイテムを作成する  
`/notion (giji|mtg|議事録) {summary}` 新しい議事録を作成する  
`/notion (inc|ts|障害報告) {summary}` 新しい障害報告を作成する  
`/notion (day|日報|week|週報) {summary}` 新しい日報・週報を作成する

## Slack App

```
_metadata:
  major_version: 1
  minor_version: 1
display_information:
  name: NotionSlackSlashCommand
features:
  bot_user:
    display_name: NotionSlackSlashCommand
    always_online: false
  slash_commands:
    - command: /notion
      url: 
      description: Create Notion Database Item
      usage_hint: giji summary
      should_escape: false
oauth_config:
  scopes:
    bot:
      - commands
      - chat:write
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

## Debug

```
aws configure
npm install

cd serverless-aws
# serverless invoke local --function notion
npx serverless offline --noPrependStageInUrl
ngrok http 3000
```

## Deploy

```
cd serverless-aws
mv _env .env
npx serverless deploy
```
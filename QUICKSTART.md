# KeeperHub MCP Server - Quick Start Guide

Get started with the KeeperHub MCP Server in 5 minutes.

## Prerequisites

- Docker (recommended) OR Node.js 22+
- KeeperHub account with API key
- MCP-compatible client (e.g., Claude Code)

## Step 1: Get Your API Key

1. Log in to [app.keeperhub.com](https://app.keeperhub.com)
2. Go to **Organization Settings** → **API Keys**
3. Click **Create API Key**
4. Name it (e.g., "MCP Server")
5. Copy the key (starts with `kh_`)

## Step 2: Run with Docker (Recommended)

### Build the image:
```bash
docker build -t keeperhub-mcp .
```

### Run the server:
```bash
docker run -i --rm \
  -e KEEPERHUB_API_KEY=kh_your_key_here \
  keeperhub-mcp
```

## Step 3: Configure Your MCP Client

### For Claude Code:

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "keeperhub": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "KEEPERHUB_API_KEY=kh_your_key_here",
        "keeperhub-mcp"
      ]
    }
  }
}
```

Or use environment variable:

```json
{
  "mcpServers": {
    "keeperhub": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "KEEPERHUB_API_KEY",
        "keeperhub-mcp"
      ],
      "env": {
        "KEEPERHUB_API_KEY": "kh_your_key_here"
      }
    }
  }
}
```

## Step 4: Test It!

Try these commands in your MCP client:

### List workflows:
```
list_workflows
```

### Create a workflow:
```json
{
  "name": "My First Workflow",
  "description": "Created via MCP"
}
```

### Generate with AI:
```json
{
  "prompt": "Create a workflow that monitors Ethereum gas prices and sends a notification when they drop below 50 gwei"
}
```

## Alternative: Run Without Docker

### Install dependencies:
```bash
pnpm install
```

### Build:
```bash
pnpm build
```

### Run:
```bash
KEEPERHUB_API_KEY=kh_your_key_here pnpm start
```

### MCP config for local development:
```json
{
  "mcpServers": {
    "keeperhub": {
      "command": "node",
      "args": [
        "/absolute/path/to/keeperhub-mcp/dist/index.js"
      ],
      "env": {
        "KEEPERHUB_API_KEY": "kh_your_key_here"
      }
    }
  }
}
```

## Available Tools

Once configured, you'll have access to these tools:

- `list_workflows` - List all workflows (filter by `project_id` or `tag_id`)
- `get_workflow` - Get workflow details
- `create_workflow` - Create new workflow (supports `project_id`, `tag_id`)
- `update_workflow` - Update existing workflow (supports `project_id`, `tag_id`)
- `delete_workflow` - Delete workflow (use `force: true` to delete with execution history)
- `generate_workflow` - AI-powered generation
- `execute_workflow` - Run a workflow
- `get_execution_status` - Check execution status
- `get_execution_logs` - Get execution logs
- `list_projects` - List projects (use IDs as `project_id` in workflow tools)
- `list_tags` - List tags (use IDs as `tag_id` in workflow tools)

## Available Resources

- `keeperhub://workflows` - All workflows
- `keeperhub://workflows/{id}` - Specific workflow

## Troubleshooting

### "Error: KEEPERHUB_API_KEY environment variable is required"
Make sure you're passing the API key via environment variable.

### "401 Unauthorized"
Check that your API key is correct and hasn't been revoked.

### "Connection refused"
Ensure the Docker container is running and MCP client is configured correctly.

### Docker not found
Install Docker: https://docs.docker.com/get-docker/

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check out [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute
- Visit [KeeperHub Docs](https://docs.keeperhub.com) for workflow guides

## Support

- GitHub Issues: [techops-services/keeperhub-mcp](https://github.com/techops-services/keeperhub-mcp/issues)
- Email: support@keeperhub.com
- Discord: [KeeperHub Community](https://discord.gg/keeperhub)

## Example Workflow

Here's a complete example of creating and executing a workflow:

```bash
# 1. Generate a workflow with AI
generate_workflow --prompt "Monitor Ethereum gas prices every 5 minutes"

# 2. List workflows to get the ID
list_workflows

# 3. Get workflow details
get_workflow --workflow_id wf_abc123

# 4. Execute the workflow
execute_workflow --workflow_id wf_abc123

# 5. Check execution status
get_execution_status --execution_id exec_xyz789

# 6. Get execution logs
get_execution_logs --execution_id exec_xyz789
```

Happy automating!

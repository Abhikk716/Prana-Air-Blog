module.exports = {
  apps: [
    {
      name: "pranaair-cms",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3032",
      node_args: "--max-old-space-size=2048",
      instances: 1,
      exec_mode: "cluster",
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "production",
        PORT: 3032,
      },
    },
  ],
};

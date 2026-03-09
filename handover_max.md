Move the app to a hosted cloud deployment on AWS, starting with a single
    EC2 instance.
  - Run the backend API, frontend, and all loop execution on that same EC2 host
    for v1.
  - Use Supabase for email/password auth and make Supabase Postgres the primary
    database.
  - Add a GitHub connector so the user can connect repos via GitHub OAuth,
    including private repos.
  - Let loops run against connected GitHub repos and allow them to push changes. (ideally on separate branches)
  - Keep loops server-side and persistent across browser disconnects, with
    roughly 10 concurrent loops supported on one machine.
  - Preserve the current live loop status and output experience already present.
  - Install OpenCode CLI on the EC2 instance as a required runtime dependency.
  - Keep operations simple in v1: manual deploys, server-managed env vars for
    secrets, temporary AWS hostname acceptable, and manual recovery after
    restarts.
  - Design the setup so it can evolve later toward autoscaling and a more
    distributed runtime without redoing the product model.
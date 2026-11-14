# Security

kontainers controls the Docker daemon of the host it runs on, which is root on that host. A flaw
in it can give someone that access, so reports are welcome.

## Reporting

Report a vulnerability privately through GitHub: on the repository's Security tab, choose
"Report a vulnerability". Please do not open a public issue for it.

Include the version, how kontainers was run (compose file or `docker run` command, with secrets
removed), and the steps that show the problem.

## Supported versions

Only the latest 0.2.x release gets fixes. Releases 0.1.x accepted any login and must not be run.

## What is in scope

Anything that lets someone without a kontainers account control Docker, read kontainers' data, or
act as a logged-in user, and anything that lets a logged-in user affect kontainers itself (other
accounts, sessions, the proxy's admin API) beyond what the README describes.

Every account can control the Docker host as root by design (for example by starting a privileged
container); that alone is not a vulnerability.

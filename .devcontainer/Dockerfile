FROM ruby:4.0.0

ARG TZ
ENV TZ="$TZ"

# Install basic development tools, iptables/ipset, and Rails dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  libsqlite3-dev \
  libyaml-dev \
  libvips-dev \
  curl \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user
ARG USERNAME=developer
RUN groupadd --gid 1000 $USERNAME && \
  useradd --uid 1000 --gid $USERNAME --shell /bin/zsh --create-home $USERNAME

# Persist command history
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

ENV DEVCONTAINER=true

# Create workspace and config directories
RUN mkdir -p /workspace /home/$USERNAME/.claude /home/$USERNAME/.local && \
  chown -R $USERNAME:$USERNAME /workspace /home/$USERNAME/.claude /home/$USERNAME/.local

WORKDIR /workspace

# Install git-delta for better diffs
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Allow developer user to install gems and run bundler
RUN mkdir -p /usr/local/bundle && chown -R $USERNAME:$USERNAME /usr/local/bundle

# Switch to non-root user
USER $USERNAME

ENV SHELL=/bin/zsh
ENV EDITOR=nano
ENV VISUAL=nano
ENV PATH="/home/developer/.local/bin:$PATH"

# Install zsh with plugins
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install Claude Code via native installer
RUN curl -fsSL https://claude.ai/install.sh | bash

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "$USERNAME ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/$USERNAME-firewall && \
  chmod 0440 /etc/sudoers.d/$USERNAME-firewall
USER $USERNAME

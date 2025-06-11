package io.kontainers.docker

import com.github.dockerjava.api.DockerClient
import com.github.dockerjava.core.DefaultDockerClientConfig
import com.github.dockerjava.core.DockerClientImpl
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient
import com.github.dockerjava.transport.DockerHttpClient
import java.time.Duration

/**
 * Configuration for Docker client connection.
 */
class DockerClientConfig {
    companion object {
        /**
         * Creates a Docker client instance configured to connect to the local Docker daemon.
         * 
         * @return DockerClient instance
         */
        fun create(): DockerClient {
            val config = DefaultDockerClientConfig.createDefaultConfigBuilder()
                .withDockerHost("unix:///var/run/docker.sock")
                .withDockerTlsVerify(false)
                .build()
            
            val httpClient = ApacheDockerHttpClient.Builder()
                .dockerHost(config.dockerHost)
                .sslConfig(config.sslConfig)
                .maxConnections(100)
                .connectionTimeout(Duration.ofSeconds(30))
                .responseTimeout(Duration.ofSeconds(45))
                .build()
            
            return DockerClientImpl.getInstance(config, httpClient)
        }
    }
}
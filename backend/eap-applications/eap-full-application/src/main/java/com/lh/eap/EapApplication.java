package com.lh.eap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Import;
import com.lh.eap.config.FullApplicationConfiguration;

@SpringBootConfiguration
@EnableAutoConfiguration
@Import(FullApplicationConfiguration.class)
public class EapApplication {
    public static void main(String[] args) { SpringApplication.run(EapApplication.class, args); }
}

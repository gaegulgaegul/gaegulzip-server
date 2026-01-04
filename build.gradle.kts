plugins {
    kotlin("jvm") version "1.9.25"
    kotlin("plugin.spring") version "1.9.25"
    id("org.springframework.boot") version "3.5.9"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("plugin.jpa") version "1.9.25"
    jacoco
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
}

group = "xyz.gaegulzip"
version = "0.0.1-SNAPSHOT"
description = "gaegulzip-server"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
    maven {
        url = uri("https://repo.spring.io/milestone")
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("com.h2database:h2")

    // === MCP + Document Reader 추가 ===
    implementation("org.springframework.ai:spring-ai-bom:1.1.2")
    implementation("org.springframework.ai:spring-ai-starter-mcp-server:1.1.2")

    // === Modulith ===
    implementation(platform("org.springframework.modulith:spring-modulith-bom:1.1.3"))
    implementation("org.springframework.modulith:spring-modulith-starter-core")

    // === test ===
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.springframework.modulith:spring-modulith-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // === Detekt ===
    // TODO: Detekt는 Kotlin 버전 호환성 문제로 인해 임시 비활성화
    // detektPlugins("io.gitlab.arturbosch.detekt:detekt-formatting:1.23.6")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

allOpen {
    annotation("jakarta.persistence.Entity")
    annotation("jakarta.persistence.MappedSuperclass")
    annotation("jakarta.persistence.Embeddable")
}

tasks.withType<Test> {
    useJUnitPlatform()
    finalizedBy(tasks.jacocoTestReport)
}

// === JaCoCo Configuration ===
jacoco {
    toolVersion = "0.8.12"
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)

    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
    }

    classDirectories.setFrom(
        files(
            classDirectories.files.map {
                fileTree(it) {
                    exclude(
                        "**/Application.class",
                        "**/ApplicationKt.class",
                        "**/*Application.class",
                        "**/*ApplicationKt.class",
                        "**/config/**",
                        "**/*Config.class",
                    )
                }
            },
        ),
    )
}

tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)

    violationRules {
        rule {
            enabled = true
            element = "BUNDLE"

            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.50".toBigDecimal()
            }

            limit {
                counter = "BRANCH"
                value = "COVEREDRATIO"
                minimum = "0.40".toBigDecimal()
            }
        }
    }

    classDirectories.setFrom(
        files(
            classDirectories.files.map {
                fileTree(it) {
                    exclude(
                        "**/Application.class",
                        "**/ApplicationKt.class",
                        "**/*Application.class",
                        "**/*ApplicationKt.class",
                        "**/config/**",
                        "**/*Config.class",
                    )
                }
            },
        ),
    )
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}

ktlint {
    version.set("1.0.1")
    android.set(false)
    outputToConsole.set(true)
}

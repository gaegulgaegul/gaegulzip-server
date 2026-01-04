package xyz.gaegulzip

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class GaegulzipServerApplication

fun main(args: Array<String>) {
    runApplication<GaegulzipServerApplication>(*args)
}

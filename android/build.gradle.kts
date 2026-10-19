val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
    if (project.name == "flutter_avif_android") {
        // flutter_avif_android 3.1.0 ships the same plugin class in Java and
        // Kotlin. Flutter now adds Kotlin compilation to this Java-only plugin,
        // producing a duplicate class and mismatched JVM targets. Keep its
        // original Java implementation; revisit when the package is upgraded.
        tasks.matching { it.name.startsWith("compile") && it.name.endsWith("Kotlin") }
            .configureEach {
                enabled = false
            }
        afterEvaluate {
            extensions.configure<com.android.build.api.dsl.LibraryExtension> {
                compileSdk = 37
                defaultConfig.minSdk = 24
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

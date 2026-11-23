import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing reuses the Kotlin shell's untracked keystore (../../android/keystore.properties).
val keystoreFile = rootProject.file(
    System.getenv("OJASSS_SIGNING_PROPERTIES") ?: "../../android/keystore.properties"
)
val keystoreProps = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use(::load) }

android {
    namespace = "com.ojasss.ojasss"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Separate from the Kotlin app (com.ojasss.app) so both can be installed side by side.
        // Use "com.ojasss.app" instead if this build replaces it on the Play Store.
        applicationId = "com.ojasss.inida"
        minSdk = maxOf(24, flutter.minSdkVersion)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = keystoreFile.parentFile.resolve(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Falls back to debug keys only when the release keystore isn't present.
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    implementation("androidx.media3:media3-transformer:1.9.2") {
        exclude(group = "com.airbnb.android", module = "lottie")
    }
    implementation("androidx.media3:media3-effect:1.9.2") {
        exclude(group = "com.airbnb.android", module = "lottie")
    }
}

flutter {
    source = "../.."
}

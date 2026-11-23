import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// Push notifications are optional: the Google Services plugin is applied only when a
// Firebase config file is present, so builds never break without it.
val nativePreview = findProperty("ojasss.nativePreview") == "true"
val hasFirebaseConfig = !nativePreview && file("google-services.json").exists()
if (hasFirebaseConfig) apply(plugin = libs.plugins.google.services.get().pluginId)

// Release signing comes from an untracked keystore.properties (never committed).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

val baseUrl = (findProperty("ojasss.baseUrl") as String?) ?: "https://ojasss.com"
require(baseUrl.startsWith("https://") || baseUrl.startsWith("http://10.0.2.2") || baseUrl.startsWith("http://localhost")) {
    "ojasss.baseUrl must be https"
}
val appHost = baseUrl.removePrefix("https://").removePrefix("http://").substringBefore('/').substringBefore(':')

android {
    namespace = "com.ojasss.app"
    compileSdk = 36

    defaultConfig {
        applicationId = if (nativePreview) "com.ojasss.app.nativepreview" else "com.ojasss.app"
        minSdk = 24
        targetSdk = 36
        versionCode = if (nativePreview) 19 else (findProperty("ojasss.versionCode") as String).toInt()
        versionName = if (nativePreview) "1.0.18" else findProperty("ojasss.versionName") as String
        buildConfigField("String", "BASE_URL", "\"$baseUrl\"")
        buildConfigField("String", "APP_HOST", "\"$appHost\"")
        buildConfigField("boolean", "PUSH_ENABLED", hasFirebaseConfig.toString())
        manifestPlaceholders["appHost"] = appHost
        manifestPlaceholders["shellEnabled"] = (!nativePreview).toString()
        manifestPlaceholders["nativePreviewEnabled"] = nativePreview.toString()
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            resValue("string", "app_name", "OJASSS Debug")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
            resValue("string", "app_name", if (nativePreview) "OJASSS Native Preview" else "OJASSS")
        }
    }

    buildFeatures {
        buildConfig = true
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.swiperefresh)
    implementation(libs.androidx.browser)
    // Activity Result APIs require Fragment >= 1.3 when a transitive dependency pulls an old one.
    implementation(libs.androidx.fragment)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    testImplementation(libs.junit)
}

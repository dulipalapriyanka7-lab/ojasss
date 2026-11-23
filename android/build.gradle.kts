// The Android plugin's Guava cache requires this support class at configuration time.
buildscript {
    repositories { mavenCentral() }
    dependencies { classpath(files("gradle/build-support/failureaccess-1.0.2.jar")) }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.google.services) apply false
}

package com.ojasss.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure-logic tests for path handling (Uri-based checks need Robolectric; kept to string logic here). */
class UrlPolicyTest {
    @Test
    fun migration_hostsIncludeOnlyOwnedProductionAliases() {
        assertTrue(UrlPolicy.appHosts("ojasss.com").contains("new.ojasss.com"))
        assertTrue(UrlPolicy.appHosts("new.ojasss.com").contains("ojasss.com"))
        assertFalse(UrlPolicy.appHosts("ojasss.com").contains("evil.example"))
        assertEquals(setOf("staging.example", "www.staging.example"), UrlPolicy.appHosts("staging.example"))
    }

    @Test
    fun safePath_acceptsSameSitePaths() {
        assertEquals("/post/abc", UrlPolicy.safePath("/post/abc"))
        assertEquals("/messages/1?x=2", UrlPolicy.safePath("/messages/1?x=2"))
    }

    @Test
    fun safePath_rejectsExternalAndTraversalTricks() {
        assertEquals("/", UrlPolicy.safePath("https://evil.example"))
        assertEquals("/", UrlPolicy.safePath("//evil.example"))
        assertEquals("/", UrlPolicy.safePath("/\\evil.example"))
        assertEquals("/", UrlPolicy.safePath("javascript:alert(1)"))
        assertEquals("/", UrlPolicy.safePath("/<script>"))
        assertEquals("/", UrlPolicy.safePath(null))
    }

    @Test
    fun refresh_isDisabledWhereThePageOwnsScrolling() {
        assertFalse(UrlPolicy.refreshAllowed("/"))
        assertFalse(UrlPolicy.refreshAllowed("/messages/123"))
        assertFalse(UrlPolicy.refreshAllowed("/admin/users"))
        assertTrue(UrlPolicy.refreshAllowed("/explore"))
        assertTrue(UrlPolicy.refreshAllowed("/profile/asha"))
    }
}

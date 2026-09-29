package com.arjun.arjundubey

import com.google.firebase.auth.FirebaseAuth
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

@Serializable
data class TodoPatch(
    val parentId: String? = null,
    val type: String? = null,
    val task: String? = null,
    val isCompleted: Boolean? = null,
    val timestamp: Long? = null,
    val steps: List<String>? = null,
    val whiteboardJson: String? = null,
)

class ApiException(val code: Int, message: String) : Exception(message)

internal object TodoJson {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    fun encodeTodo(todo: Todo): String = json.encodeToString(todo)

    fun encodePatch(patch: TodoPatch): String = json.encodeToString(patch)
}

class TodoApiClient(
    baseUrl: String = BuildConfig.API_BASE_URL,
) {
    private val baseUrl = baseUrl.trimEnd('/')

    suspend fun getTodos(userId: String): List<Todo> {
        val body = request("GET", "$baseUrl/users/${pathSegment(userId)}/todos")
        return TodoJson.json.decodeFromString(body)
    }

    suspend fun createTodo(userId: String, todo: Todo) {
        request(
            "POST",
            "$baseUrl/users/${pathSegment(userId)}/todos",
            TodoJson.encodeTodo(todo),
        )
    }

    suspend fun updateTodo(userId: String, todoId: String, patch: TodoPatch) {
        request(
            "PATCH",
            "$baseUrl/users/${pathSegment(userId)}/todos/${pathSegment(todoId)}",
            TodoJson.encodePatch(patch),
        )
    }

    suspend fun deleteTodo(userId: String, todoId: String) {
        request(
            "DELETE",
            "$baseUrl/users/${pathSegment(userId)}/todos/${pathSegment(todoId)}",
        )
    }

    suspend fun getVaultFiles(userId: String): List<VaultFile> {
        val body = request("GET", "$baseUrl/users/${pathSegment(userId)}/vault")
        return TodoJson.json.decodeFromString(body)
    }

    suspend fun createVaultFile(userId: String, file: VaultFileUpload): VaultFile {
        val body = request(
            "POST",
            "$baseUrl/users/${pathSegment(userId)}/vault",
            TodoJson.json.encodeToString(file),
        )
        return TodoJson.json.decodeFromString(body)
    }

    suspend fun deleteVaultFile(userId: String, fileId: String) {
        request(
            "DELETE",
            "$baseUrl/users/${pathSegment(userId)}/vault/${pathSegment(fileId)}",
        )
    }

    private suspend fun request(method: String, url: String, body: String? = null): String {
        val first = dispatch(method, url, body, forceRefresh = false)
        if (first.code == 401) {
            first.close()
            return read(dispatch(method, url, body, forceRefresh = true))
        }
        return read(first)
    }

    private suspend fun dispatch(
        method: String,
        url: String,
        body: String?,
        forceRefresh: Boolean,
    ): okhttp3.Response {
        val token = getAuthToken(forceRefresh)
        val builder = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
        val request = when (method) {
            "GET" -> builder.get().build()
            "DELETE" -> builder.delete().build()
            "POST" -> builder.post(requireNotNull(body).toRequestBody(jsonMedia)).build()
            "PATCH" -> builder.patch(requireNotNull(body).toRequestBody(jsonMedia)).build()
            else -> error("Unsupported method $method")
        }
        return withContext(Dispatchers.IO) {
            client.newCall(request).execute()
        }
    }

    private fun read(response: okhttp3.Response): String {
        response.use {
            val text = it.body?.string().orEmpty()
            if (!it.isSuccessful) throw ApiException(it.code, parseError(text, it.code))
            return text
        }
    }

    private fun parseError(text: String, code: Int): String {
        val message = runCatching {
            TodoJson.json.decodeFromString<ErrorResponse>(text).error
        }.getOrNull()
        return if (message.isNullOrBlank()) "Request failed ($code)" else message
    }

    private suspend fun getAuthToken(forceRefresh: Boolean): String {
        val user = FirebaseAuth.getInstance().currentUser
            ?: throw ApiException(401, "Not signed in")
        return suspendCancellableCoroutine { continuation ->
            user.getIdToken(forceRefresh)
                .addOnSuccessListener { result ->
                    if (!continuation.isActive) return@addOnSuccessListener
                    val token = result.token
                    if (token.isNullOrBlank()) {
                        continuation.resumeWithException(ApiException(401, "Missing auth token"))
                    } else {
                        continuation.resume(token)
                    }
                }
                .addOnFailureListener { error ->
                    if (!continuation.isActive) return@addOnFailureListener
                    continuation.resumeWithException(
                        ApiException(401, error.message ?: "Could not get auth token")
                    )
                }
        }
    }

    @Serializable
    private data class ErrorResponse(val error: String = "")

    companion object {
        private val jsonMedia = "application/json; charset=utf-8".toMediaType()
        private val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .callTimeout(60, TimeUnit.SECONDS)
            .build()

        private fun pathSegment(value: String): String =
            URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}

@Serializable
data class VaultFile(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("file_name") val fileName: String,
    @SerialName("mime_type") val mimeType: String,
    val data: String,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class VaultFileUpload(
    @SerialName("file_name") val fileName: String,
    @SerialName("mime_type") val mimeType: String,
    val data: String,
)

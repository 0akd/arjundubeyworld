package com.arjun.arjundubey

import android.content.ContentValues
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun VaultScreen(
    userId: String,
    onOpenDrawer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val api = remember { TodoApiClient() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val actionScroll = rememberScrollState()

    var allFiles by remember { mutableStateOf<List<VaultFile>>(emptyList()) }
    var currentFolderId by remember { mutableStateOf("") }
    var isEditMode by remember { mutableStateOf(false) }
    var clipboardNode by remember { mutableStateOf<VaultFile?>(null) }
    var isCutOperation by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }
    var nodeToRename by remember { mutableStateOf<VaultFile?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isUploading by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(userId) {
        isLoading = true
        try {
            allFiles = api.getVaultFiles(userId)
            loadError = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            loadError = e.message ?: "Could not load files"
        } finally {
            isLoading = false
        }
    }

    fun persist(block: suspend () -> Unit) {
        scope.launch {
            try {
                block()
                loadError = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val message = e.message ?: "Could not save changes"
                try {
                    allFiles = api.getVaultFiles(userId)
                } catch (reload: CancellationException) {
                    throw reload
                } catch (_: Exception) {
                    // Keep the list already on screen.
                }
                loadError = message
            }
        }
    }

    suspend fun copyVaultTree(
        source: VaultFile,
        parentId: String,
        snapshot: List<VaultFile>,
    ): List<VaultFile> {
        val created = api.createVaultFile(
            userId,
            VaultFileUpload(
                parentId = parentId,
                type = if (source.type == "FOLDER") "FOLDER" else "FILE",
                fileName = source.fileName,
                mimeType = if (source.type == "FOLDER") "" else source.mimeType,
                data = if (source.type == "FOLDER") "" else source.data,
                timestamp = System.currentTimeMillis(),
            ),
        )
        val copies = mutableListOf(created)
        if (source.type == "FOLDER") {
            val children = snapshot
                .filter { it.parentId == source.id }
                .sortedBy { it.timestamp }
            for (child in children) {
                copies += copyVaultTree(child, created.id, snapshot)
            }
        }
        return copies
    }

    fun downloadFile(file: VaultFile) {
        scope.launch {
            try {
                val bytes = withContext(Dispatchers.Default) {
                    val payload = file.data.substringAfter("base64,", "")
                    if (payload.isEmpty()) error("empty")
                    Base64.decode(payload, Base64.DEFAULT)
                }
                val message = withContext(Dispatchers.IO) {
                    saveVaultDownload(context, file, bytes)
                }
                Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Toast.makeText(context, "Download failed", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val folderId = currentFolderId
        scope.launch {
            isUploading = true
            loadError = null
            try {
                val contentResolver = context.contentResolver
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                var fileName = "unnamed_file"
                contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (cursor.moveToFirst() && nameIndex >= 0) {
                        fileName = cursor.getString(nameIndex) ?: fileName
                    }
                }
                val bytes = withContext(Dispatchers.IO) {
                    contentResolver.openInputStream(uri)?.use { it.readBytes() }
                }
                if (bytes == null) {
                    loadError = "Could not read file"
                } else if (bytes.size > 7 * 1024 * 1024) {
                    Toast.makeText(context, "File too large (Limit is ~7MB)", Toast.LENGTH_LONG).show()
                } else {
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    val created = api.createVaultFile(
                        userId,
                        VaultFileUpload(
                            parentId = folderId,
                            type = "FILE",
                            fileName = fileName,
                            mimeType = mimeType,
                            data = "data:$mimeType;base64,$base64",
                            timestamp = System.currentTimeMillis(),
                        ),
                    )
                    allFiles = listOf(created) + allFiles
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                loadError = e.message ?: "Failed to upload file"
            } finally {
                isUploading = false
            }
        }
    }

    val currentFolder = allFiles.find { it.id == currentFolderId }
    val displayFiles = allFiles
        .filter { it.parentId == currentFolderId }
        .sortedByDescending { it.timestamp }
    val clipped = clipboardNode

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                IconButton(onClick = onOpenDrawer) {
                    Icon(Icons.Default.Menu, contentDescription = "Menu")
                }
                if (currentFolderId.isNotEmpty()) {
                    IconButton(onClick = {
                        currentFolderId = currentFolder?.parentId ?: ""
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
                Text(
                    text = currentFolder?.fileName ?: "Vault",
                    style = MaterialTheme.typography.titleLarge,
                )
            }
            Row(
                modifier = Modifier.horizontalScroll(actionScroll),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (clipped != null && isEditMode) {
                    val canPaste = isValidVaultPaste(currentFolderId, clipped.id, allFiles)
                    TextButton(
                        enabled = canPaste,
                        onClick = {
                            val destination = currentFolderId
                            if (isCutOperation) {
                                allFiles = allFiles.map {
                                    if (it.id == clipped.id) it.copy(parentId = destination) else it
                                }
                                clipboardNode = null
                                persist {
                                    api.updateVaultFile(
                                        userId,
                                        clipped.id,
                                        VaultFilePatch(parentId = destination),
                                    )
                                }
                            } else {
                                val snapshot = allFiles
                                persist {
                                    val copies = copyVaultTree(clipped, destination, snapshot)
                                    allFiles = allFiles + copies
                                }
                            }
                        },
                    ) {
                        Text("Paste")
                    }
                }
                TextButton(onClick = {
                    isEditMode = !isEditMode
                    if (!isEditMode) clipboardNode = null
                }) {
                    Text(if (isEditMode) "Done" else "Edit")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        val errorMessage = loadError
        if (errorMessage != null) {
            Text(errorMessage, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(8.dp))
        } else if (isLoading && allFiles.isEmpty()) {
            Text("Loading files...")
            Spacer(modifier = Modifier.height(8.dp))
        }

        Button(
            onClick = { filePickerLauncher.launch("*/*") },
            enabled = !isUploading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (isUploading) "Uploading..." else "Upload File")
        }

        if (isEditMode) {
            Spacer(modifier = Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    modifier = Modifier.weight(1f),
                    label = { Text("New Folder") },
                    singleLine = true,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    enabled = newFolderName.isNotBlank(),
                    onClick = {
                        val folderId = currentFolderId
                        val name = newFolderName.trim()
                        newFolderName = ""
                        persist {
                            val created = api.createVaultFile(
                                userId,
                                VaultFileUpload(
                                    parentId = folderId,
                                    type = "FOLDER",
                                    fileName = name,
                                    mimeType = "",
                                    data = "",
                                    timestamp = System.currentTimeMillis(),
                                ),
                            )
                            allFiles = allFiles + created
                        }
                    },
                ) {
                    Text("Create Folder")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (!isLoading && displayFiles.isEmpty()) {
            Text("Nothing in this folder yet.", color = Color.Gray)
        }

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(displayFiles, key = { _, file -> file.id }) { index, file ->
                VaultFileCard(
                    file = file,
                    isEditMode = isEditMode,
                    isCutTarget = isCutOperation && clipboardNode?.id == file.id,
                    canMoveUp = index > 0,
                    canMoveDown = index < displayFiles.size - 1,
                    onOpenFolder = {
                        if (file.type == "FOLDER") currentFolderId = file.id
                    },
                    onDownload = { downloadFile(file) },
                    onMoveUp = {
                        val prev = displayFiles[index - 1]
                        val (newCurr, newPrev) = swappedTimestamps(file.timestamp, prev.timestamp, up = true)
                        allFiles = allFiles.map {
                            when (it.id) {
                                file.id -> it.copy(timestamp = newCurr)
                                prev.id -> it.copy(timestamp = newPrev)
                                else -> it
                            }
                        }
                        persist {
                            api.updateVaultFile(userId, file.id, VaultFilePatch(timestamp = newCurr))
                            api.updateVaultFile(userId, prev.id, VaultFilePatch(timestamp = newPrev))
                        }
                    },
                    onMoveDown = {
                        val next = displayFiles[index + 1]
                        val (newCurr, newNext) = swappedTimestamps(file.timestamp, next.timestamp, up = false)
                        allFiles = allFiles.map {
                            when (it.id) {
                                file.id -> it.copy(timestamp = newCurr)
                                next.id -> it.copy(timestamp = newNext)
                                else -> it
                            }
                        }
                        persist {
                            api.updateVaultFile(userId, file.id, VaultFilePatch(timestamp = newCurr))
                            api.updateVaultFile(userId, next.id, VaultFilePatch(timestamp = newNext))
                        }
                    },
                    onCut = {
                        clipboardNode = file
                        isCutOperation = true
                    },
                    onCopy = {
                        clipboardNode = file
                        isCutOperation = false
                    },
                    onRename = { nodeToRename = file },
                    onDelete = {
                        val ids = collectVaultDeleteOrder(file.id, allFiles)
                        val remove = ids.toSet()
                        allFiles = allFiles.filter { it.id !in remove }
                        if (clipboardNode?.id in remove) clipboardNode = null
                        if (currentFolderId in remove) currentFolderId = ""
                        persist {
                            for (id in ids) api.deleteVaultFile(userId, id)
                        }
                    },
                )
            }
        }
    }

    val renaming = nodeToRename
    if (renaming != null) {
        VaultRenameDialog(
            file = renaming,
            onDismiss = { nodeToRename = null },
            onConfirm = { name ->
                allFiles = allFiles.map {
                    if (it.id == renaming.id) it.copy(fileName = name) else it
                }
                nodeToRename = null
                persist {
                    api.updateVaultFile(userId, renaming.id, VaultFilePatch(fileName = name))
                }
            },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun VaultFileCard(
    file: VaultFile,
    isEditMode: Boolean,
    isCutTarget: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onOpenFolder: () -> Unit,
    onDownload: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onCut: () -> Unit,
    onCopy: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (isCutTarget) 0.4f else 1f)
            .combinedClickable(onClick = onOpenFolder),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = if (file.type == "FOLDER") "📁 ${file.fileName}" else file.fileName,
                style = MaterialTheme.typography.titleMedium,
            )

            if (file.type != "FOLDER") {
                if (file.mimeType.startsWith("image/")) {
                    val bitmap = rememberVaultBitmap(file.data)
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap,
                            contentDescription = file.fileName,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 300.dp)
                                .padding(top = 8.dp),
                            contentScale = ContentScale.Fit,
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                            .background(Color.LightGray.copy(alpha = 0.3f))
                            .padding(12.dp),
                    ) {
                        Text("📄 Document (${file.mimeType})")
                    }
                }
                TextButton(onClick = onDownload, modifier = Modifier.padding(top = 4.dp)) {
                    Text("Download")
                }
            }

            if (isEditMode) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                        Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Move Up")
                    }
                    IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Move Down")
                    }
                    IconButton(onClick = onRename) { Text("✏️") }
                    IconButton(onClick = onCut) { Text("✂️") }
                    IconButton(onClick = onCopy) { Text("📋") }
                    IconButton(onClick = onDelete) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Delete",
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            file.createdAt?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray,
                    modifier = Modifier.align(Alignment.End).padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun VaultRenameDialog(
    file: VaultFile,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var renameText by remember { mutableStateOf(file.fileName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (file.type == "FOLDER") "Rename Folder" else "Rename File") },
        text = {
            OutlinedTextField(
                value = renameText,
                onValueChange = { renameText = it },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                enabled = renameText.isNotBlank() && renameText != file.fileName,
                onClick = { onConfirm(renameText.trim()) },
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun rememberVaultBitmap(dataUrl: String): ImageBitmap? {
    var bitmap by remember(dataUrl) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(dataUrl) {
        val decoded = withContext(Dispatchers.Default) {
            try {
                val payload = dataUrl.substringAfter("base64,", "")
                if (payload.isEmpty()) return@withContext null
                val bytes = Base64.decode(payload, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
        }
        bitmap = decoded?.asImageBitmap()
    }
    return bitmap
}

private fun swappedTimestamps(current: Long, neighbor: Long, up: Boolean): Pair<Long, Long> {
    if (current == neighbor) {
        return if (up) Pair(neighbor + 1, current - 1) else Pair(current - 1, neighbor + 1)
    }
    return Pair(neighbor, current)
}

private fun isValidVaultPaste(targetFolderId: String, clipboardId: String, all: List<VaultFile>): Boolean {
    if (targetFolderId == clipboardId) return false
    var current = all.find { it.id == targetFolderId }
    val seen = mutableSetOf<String>()
    while (current != null) {
        if (!seen.add(current.id)) return false
        if (current.parentId == clipboardId) return false
        current = all.find { it.id == current.parentId }
    }
    return true
}

private fun collectVaultDeleteOrder(nodeId: String, nodes: List<VaultFile>): List<String> {
    val children = nodes.filter { it.parentId == nodeId }
    return children.flatMap { collectVaultDeleteOrder(it.id, nodes) } + nodeId
}

private fun saveVaultDownload(context: Context, file: VaultFile, bytes: ByteArray): String {
    val name = safeDownloadName(file.fileName)
    val mime = file.mimeType.ifBlank { "application/octet-stream" }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: error("insert failed")
        context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("stream")
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        context.contentResolver.update(uri, values, null, null)
        return "Saved to Downloads"
    }
    val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
    val out = File(dir, name)
    out.writeBytes(bytes)
    return "Saved to ${out.parent}"
}

private fun safeDownloadName(name: String): String {
    val base = name.substringAfterLast('/').substringAfterLast('\\')
        .replace(Regex("[\\r\\n\\u0000]"), "")
        .trim()
        .ifBlank { "download" }
    return base.take(120)
}

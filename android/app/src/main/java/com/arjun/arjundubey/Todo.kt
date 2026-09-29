package com.arjun.arjundubey

data class Todo @JvmOverloads constructor(
    var id: String = "",
    var parentId: String = "", // Empty string means it's in the root folder
    var type: String = "TODO", // "TODO" or "FOLDER"
    var task: String = "",
    @JvmField
    var isCompleted: Boolean = false,
    var timestamp: Long = System.currentTimeMillis(),
    var steps: List<String> = emptyList(),
    var whiteboardJson: String = ""
)

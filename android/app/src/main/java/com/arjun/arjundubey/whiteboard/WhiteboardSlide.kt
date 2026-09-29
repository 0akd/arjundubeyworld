package com.arjun.arjundubey.whiteboard

import kotlinx.serialization.Serializable

@Serializable
data class WhiteboardSlide(
    val id: Int,
    val title: String,
    val strokes: List<Stroke> = emptyList()
)

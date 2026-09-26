package com.MarbleMaze.watch.ui.app

import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.MarbleMaze.watch.ui.theme.BrutalColors
import kotlin.math.roundToInt

/** 阴影是实心偏移图形；预留右下空间，不使用 elevation 或模糊。 */
@Composable
fun HardShadowBox(modifier: Modifier = Modifier, depth: Dp = 3.dp, radius: Dp = 12.dp, reservedDepth: Dp = depth, content: @Composable () -> Unit) {
    Box(modifier.padding(end = reservedDepth, bottom = reservedDepth).drawBehind {
        drawRoundRect(BrutalColors.Ink, topLeft = Offset(depth.toPx(), depth.toPx()),
            cornerRadius = CornerRadius(radius.toPx()), size = size)
    }) { content() }
}

@Composable
fun BrutalCard(modifier: Modifier = Modifier, color: Color = BrutalColors.Paper, depth: Dp = 3.dp,
               border: Dp = 2.dp, radius: Dp = 12.dp, content: @Composable () -> Unit) {
    HardShadowBox(modifier, depth, radius) {
        Surface(shape = RoundedCornerShape(radius), color = color, contentColor = BrutalColors.Ink,
            border = BorderStroke(border, BrutalColors.Ink), tonalElevation = 0.dp, shadowElevation = 0.dp, content = content)
    }
}

@Composable
fun BrutalButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                 color: Color = BrutalColors.Yellow, depth: Dp = 5.dp, border: Dp = 3.dp,
                 loading: Boolean = false, shadowSpace: Dp = depth, animatePress: Boolean = true, content: @Composable RowScope.() -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val displacement by animateDpAsState(if (animatePress && pressed && enabled && !loading) depth else 0.dp, tween(75), label = "按钮按压")
    HardShadowBox(modifier, if (enabled) depth else 0.dp, 9.dp, reservedDepth = shadowSpace) {
        Surface(onClick = onClick, enabled = enabled && !loading, interactionSource = interaction,
            modifier = Modifier.offset { IntOffset(displacement.roundToPx(), displacement.roundToPx()) }, shape = RoundedCornerShape(9.dp),
            color = if (enabled) color else BrutalColors.Muted, contentColor = BrutalColors.Ink,
            border = BorderStroke(border, BrutalColors.Ink), tonalElevation = 0.dp, shadowElevation = 0.dp) {
            ProvideTextStyle(MaterialTheme.typography.labelLarge) {
                Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 12.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically, content = content)
            }
        }
    }
}

@Composable
fun BrutalOutlinedButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                         loading: Boolean = false, content: @Composable RowScope.() -> Unit) {
    BrutalButton(onClick, modifier, enabled, color = BrutalColors.Paper, depth = 2.dp, border = 2.dp, loading = loading, content = content)
}

/** 小型图标操作：Level 3 控件重量，保留 75ms 按压位移。 */
@Composable
fun BrutalIconButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                     color: Color = BrutalColors.Yellow, depth: Dp = 2.dp, border: Dp = 2.dp,
                     loading: Boolean = false, contentDescription: String? = null,
                     content: @Composable () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val displacement by animateDpAsState(if (pressed && enabled && !loading) depth else 0.dp, tween(75), label = "图标按钮按压")
    // 禁用只改变阴影绘制，保留占位，避免生成状态切换时挤动整张预览卡片。
    HardShadowBox(modifier, if (enabled) depth else 0.dp, 9.dp, reservedDepth = depth) {
        Surface(onClick = onClick, enabled = enabled && !loading, interactionSource = interaction,
            modifier = Modifier.offset { IntOffset(displacement.roundToPx(), displacement.roundToPx()) }, shape = RoundedCornerShape(9.dp),
            color = if (enabled) color else BrutalColors.Muted, contentColor = BrutalColors.Ink,
            border = BorderStroke(border, BrutalColors.Ink), tonalElevation = 0.dp, shadowElevation = 0.dp) {
            Box(Modifier.size(50.dp), contentAlignment = Alignment.Center) {
                if (loading) CircularProgressIndicator(Modifier.size(22.dp), color = BrutalColors.Ink, strokeWidth = 2.5.dp)
                else {
                    if (contentDescription != null) Box(Modifier.semantics { this.contentDescription = contentDescription }) { content() }
                    else content()
                }
            }
        }
    }
}

/** 底部导航项：无硬阴影，与操作按钮明确区分。 */
@Composable
fun BrutalNavigationItem(label: String, icon: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(onClick = onClick, modifier = modifier.semantics { this.selected = selected },
        shape = RoundedCornerShape(10.dp), color = if (selected) BrutalColors.Yellow else Color.Transparent,
        contentColor = BrutalColors.Ink, border = if (selected) BorderStroke(2.dp, BrutalColors.Ink) else null,
        tonalElevation = 0.dp, shadowElevation = 0.dp) {
        Row(Modifier.heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            AppIcon(icon)
            Spacer(Modifier.width(8.dp))
            Text(label, style = MaterialTheme.typography.labelLarge,
                fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.Bold)
        }
    }
}

@Immutable
data class NeoJellyRadioItem(val label: String, val icon: String? = null)

/** 单行互斥选择组：整组硬阴影，选中宽度由邻项弹性让位，内容过长时可横向滚动。 */
@Composable
fun NeoJellyRadioGroup(
    items: List<NeoJellyRadioItem>,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    selectedColor: Color = BrutalColors.Yellow,
    unselectedColor: Color = BrutalColors.Paper,
    borderColor: Color = BrutalColors.Ink,
    cornerRadius: Dp = 6.dp,
    borderWidth: Dp = 2.dp,
    springConfig: SpringSpec<Float> = spring(stiffness = 700f, dampingRatio = 0.80f),
    enabled: Boolean = true
) {
    if (items.isEmpty()) return

    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressOffset by animateFloatAsState(
        targetValue = if (pressed && enabled) 2f else 0f,
        animationSpec = springConfig,
        label = "Jelly Radio 按压"
    )
    val shadowDepth = (4f - pressOffset * 1.25f).coerceAtLeast(1.5f).dp
    val shape = RoundedCornerShape(cornerRadius)
    val textMeasurer = rememberTextMeasurer()
    val density = androidx.compose.ui.platform.LocalDensity.current
    val labelStyle = MaterialTheme.typography.labelLarge
    val measuredLabelStyle = remember(labelStyle) { labelStyle.copy(fontWeight = FontWeight.ExtraBold) }
    val minimumWidths = remember(items, measuredLabelStyle, density) {
        items.map { item ->
            val measuredPx = textMeasurer.measure(
                text = AnnotatedString(item.label),
                style = measuredLabelStyle,
                maxLines = 1,
                softWrap = false
            ).size.width
            with(density) {
                measuredPx.toDp() + 18.dp + if (item.icon == null) 0.dp else 24.dp
            }
        }
    }
    val animatedWeights = items.indices.map { index ->
        val distance = if (selectedIndex in items.indices) kotlin.math.abs(index - selectedIndex) else Int.MAX_VALUE
        val target = when {
            distance == 0 -> 1.12f
            distance != Int.MAX_VALUE -> 1f - 0.04f / distance
            else -> 1f
        }
        animateFloatAsState(target, animationSpec = springConfig, label = "Jelly Radio 宽度 $index")
    }
    val animatedScaleY = items.indices.map { index ->
        val distance = if (selectedIndex in items.indices) kotlin.math.abs(index - selectedIndex) else Int.MAX_VALUE
        val target = when {
            distance == 0 -> 1.035f
            distance == 1 -> 0.99f
            else -> 1f
        }
        animateFloatAsState(target, animationSpec = springConfig, label = "Jelly Radio 高度 $index")
    }
    val animatedScaleX = items.indices.map { index ->
        val target = if (index == selectedIndex) 1.02f else 1f
        animateFloatAsState(target, animationSpec = springConfig, label = "Jelly Radio 弹性 $index")
    }
    val scrollState = androidx.compose.foundation.rememberScrollState()

    BoxWithConstraints(modifier.fillMaxWidth()) {
        val shadowSpace = 4.dp
        val minimumContentWidth = minimumWidths.fold(0.dp) { total, width -> total + width }
        val requiredWidth = minimumContentWidth + borderWidth * 2
        val viewportWidth = if (maxWidth == Dp.Infinity) requiredWidth else (maxWidth - shadowSpace).coerceAtLeast(0.dp)
        val groupWidth = maxOf(viewportWidth, requiredWidth)
        val innerWidth = (groupWidth - borderWidth * 2).coerceAtLeast(0.dp)
        val flexibleWidth = (innerWidth - minimumContentWidth).coerceAtLeast(0.dp)
        val totalWeight = animatedWeights.fold(0f) { total, state -> total + state.value }.coerceAtLeast(0.001f)

        HardShadowBox(Modifier.fillMaxWidth().heightIn(min = 54.dp), shadowDepth, cornerRadius, reservedDepth = shadowSpace) {
            Row(
                Modifier
                    .offset { IntOffset(pressOffset.dp.roundToPx(), pressOffset.dp.roundToPx()) }
                    .fillMaxWidth()
                    .heightIn(min = 50.dp)
                    .clip(shape)
                    .background(unselectedColor)
                    .border(borderWidth, borderColor, shape)
                    .padding(borderWidth)
                    .horizontalScroll(scrollState)
                    .selectableGroup()
            ) {
                Row(Modifier.width(innerWidth).heightIn(min = 50.dp)) {
                    items.forEachIndexed { index, item ->
                        val selected = index == selectedIndex
                        val color by animateColorAsState(
                            targetValue = if (selected) selectedColor else unselectedColor,
                            animationSpec = tween(170),
                            label = "Jelly Radio 颜色 $index"
                        )
                        val itemWidth = minimumWidths[index] + flexibleWidth * (animatedWeights[index].value / totalWeight)
                        Box(
                            Modifier
                                .width(itemWidth)
                                .heightIn(min = 50.dp)
                                .background(color)
                                .drawBehind {
                                    if (index > 0) {
                                        val x = borderWidth.toPx() / 2f
                                        drawLine(borderColor, Offset(x, 0f), Offset(x, size.height), borderWidth.toPx())
                                    }
                                }
                                .semantics(mergeDescendants = true) { contentDescription = item.label }
                                .selectable(
                                    selected = selected,
                                    enabled = enabled,
                                    role = Role.RadioButton,
                                    interactionSource = interaction,
                                    indication = null,
                                    onClick = { onSelected(index) }
                                )
                                .graphicsLayer {
                                    scaleX = animatedScaleX[index].value
                                    scaleY = animatedScaleY[index].value
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 50.dp).padding(horizontal = 8.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                item.icon?.let {
                                    AppIcon(it, Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                }
                                Text(
                                    item.label,
                                    maxLines = 1,
                                    softWrap = false,
                                    style = labelStyle,
                                    fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BrutalTag(text: String, modifier: Modifier = Modifier, color: Color = BrutalColors.Yellow) {
    Text(text, modifier.background(color, RoundedCornerShape(6.dp)).border(2.dp, BrutalColors.Ink, RoundedCornerShape(6.dp))
        .padding(horizontal = 9.dp, vertical = 5.dp), color = BrutalColors.Ink, style = MaterialTheme.typography.labelSmall)
}

@Composable
fun BrutalTextField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier,
                    label: @Composable (() -> Unit)? = null, placeholder: @Composable (() -> Unit)? = null,
                    singleLine: Boolean = true, isError: Boolean = false, keyboardOptions: KeyboardOptions = KeyboardOptions.Default) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        label?.let { ProvideTextStyle(MaterialTheme.typography.labelLarge) { it() } }
        OutlinedTextField(value, onValueChange, modifier = Modifier.fillMaxWidth().border(2.dp,
            if (isError) MaterialTheme.colorScheme.error else BrutalColors.Ink, RoundedCornerShape(8.dp)),
            placeholder = placeholder, singleLine = singleLine, isError = isError, keyboardOptions = keyboardOptions,
            textStyle = MaterialTheme.typography.titleMedium, shape = RoundedCornerShape(8.dp),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Color.Transparent, unfocusedBorderColor = Color.Transparent,
                errorBorderColor = Color.Transparent, focusedContainerColor = BrutalColors.Paper, unfocusedContainerColor = BrutalColors.Paper,
                errorContainerColor = BrutalColors.Paper))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrutalSheet(onDismissRequest: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)
    ModalBottomSheet(onDismissRequest = onDismissRequest, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = shape, containerColor = BrutalColors.Background, tonalElevation = 0.dp, dragHandle = null) {
        // 描边必须位于随弹层移动的内容内部，不能画在外层定位节点上。
        Column(Modifier.fillMaxWidth().border(3.dp, BrutalColors.Ink, shape)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.padding(vertical = 14.dp).size(44.dp, 5.dp).background(BrutalColors.Ink))
            }
            content()
        }
    }
}

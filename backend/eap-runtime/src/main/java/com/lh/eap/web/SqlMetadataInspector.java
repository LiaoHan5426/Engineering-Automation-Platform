package com.lh.eap.web;

import java.util.*;

final class SqlMetadataInspector {
    private SqlMetadataInspector(){}
    @SuppressWarnings("unchecked")
    static List<String> inspectIndexes(Object snapshot,Map<String,Object> analysis){
        if(!(snapshot instanceof List<?> indexes))return List.of("索引资料格式不正确，需要索引列表。");
        var advice=new ArrayList<String>();
        for(var item:(List<Map<String,String>>)analysis.getOrDefault("joinColumns",List.of())){
            var table=item.get("table");var column=item.get("column");
            var candidates=indexes.stream().filter(index->index instanceof Map<?,?> map && Objects.equals(map.get("table"),table) && map.get("columns") instanceof List<?> columns && !columns.isEmpty() && Objects.equals(columns.getFirst(),column)).toList();
            if(candidates.isEmpty())advice.add("所选快照未记录以 "+table+"."+column+" 为前导列的索引。这不是实时缺失结论；先核对现有索引，再用计划评估是否需要新增。");
            else for(var candidate:candidates){var index=(Map<?,?>)candidate;advice.add("快照中的索引 "+index.get("name")+" 以 "+table+"."+column+" 为前导列，可作为连接访问路径候选；仍需执行计划确认是否使用。");}
        }
        return advice;
    }
    @SuppressWarnings("unchecked")
    static List<String> inspectSchema(Object snapshot,Map<String,Object> analysis){
        if(!(snapshot instanceof List<?> tables))return List.of("表结构资料格式不正确，需要表列表。");
        var advice=new ArrayList<String>();var types=new HashMap<String,List<String>>();
        for(var item:(List<Map<String,String>>)analysis.getOrDefault("joinColumns",List.of())){
            var owners=tables.stream().filter(table->table instanceof Map<?,?> map&&Objects.equals(map.get("name"),item.get("table"))).toList();
            if(owners.size()!=1){advice.add("快照中不能唯一定位表 "+item.get("table")+"；请使用与 SQL 一致的完整表名。");continue;}
            var owner=(Map<?,?>)owners.getFirst();
            if(owner.get("columns") instanceof List<?> columns){
                var matches=columns.stream().filter(column->column instanceof Map<?,?> map&&Objects.equals(map.get("name"),item.get("column"))).toList();
                if(matches.size()!=1){advice.add("快照未能定位关联列 "+item.get("table")+"."+item.get("column")+"，不能据此推荐索引。");continue;}
                var column=(Map<?,?>)matches.getFirst();
                var type=Objects.toString(column.get("type"),"").toLowerCase(Locale.ROOT).trim();
                if(!type.isBlank())types.computeIfAbsent(item.get("condition"),key->new ArrayList<>()).add(type);
            }
        }
        for(var entry:types.entrySet())if(entry.getValue().size()==2&&!entry.getValue().get(0).equals(entry.getValue().get(1)))advice.add("关联 "+entry.getKey()+" 的登记类型不同："+entry.getValue()+"。请核对方言转换规则及计划中的隐式转换，不能直接假定类型转换一定降低性能。");
        return advice;
    }
}

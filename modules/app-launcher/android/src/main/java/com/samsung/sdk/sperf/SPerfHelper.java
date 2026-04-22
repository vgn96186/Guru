package com.samsung.sdk.sperf;

import android.content.Context;

public class SPerfHelper {
    public static Object initSPerfManager(Context ctx) {
        SPerfManager m = SPerfManager.initSPerfManager();
        if (m == null) {
            m = SPerfManager.createInstance(ctx);
        }
        return m;
    }
    
    public static void addListener(Object m, SPerfListener l) {
        ((SPerfManager) m).addSPerfListerner(l);
    }
    
    public static int startPresetBoost(Object m, int type, int duration) {
        return ((SPerfManager) m).startPresetBoost(type, duration);
    }
    
    public static int stopBoost(Object m, int id) {
        return ((SPerfManager) m).stopBoost(id, 0);
    }
}
